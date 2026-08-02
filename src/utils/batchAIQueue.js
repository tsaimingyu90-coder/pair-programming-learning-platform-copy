/**
 * 批次 AI 處理佇列 - 安全限流機制
 * 避免一次並發太多請求導致 Gemini 故障
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 執行佇列式任務，支援並發限制與重試
 * @param {Array} items - 待處理項目
 * @param {Function} worker - 處理單一項目的函數，接收 (item) 返回 Promise
 * @param {Object} options - 配置
 *   - concurrency: 並發數 (default: 1)
 *   - delayMs: 項目間延遲時間 (default: 800)
 *   - retries: 單筆失敗重試次數 (default: 1)
 *   - retryDelays: 重試延遲數組 (default: [2000, 5000])
 *   - onProgress: 進度回調 (itemId, status, result, error)
 * @returns Promise<{success, failed, skipped}>
 */
export async function processBatchWithConcurrencyLimit(items, worker, options = {}) {
  const {
    concurrency = 1,
    delayMs = 800,
    retries = 1,
    retryDelays = [2000, 5000],
    onProgress = () => {}
  } = options;

  if (items.length === 0) {
    return { success: 0, failed: 0, skipped: 0, results: [] };
  }

  const results = new Map();
  const queue = items.map((item, idx) => ({ item, index: idx }));
  let processing = 0;
  let queueIndex = 0;
  const errors = [];

  return new Promise((resolve) => {
    const processNext = async () => {
      if (queueIndex >= queue.length && processing === 0) {
        // 全部完成
        const summary = {
          success: Array.from(results.values()).filter(r => r.status === 'success').length,
          failed: Array.from(results.values()).filter(r => r.status === 'failed').length,
          skipped: Array.from(results.values()).filter(r => r.status === 'skipped').length,
          results: Array.from(results.values())
        };
        resolve(summary);
        return;
      }

      if (processing >= concurrency || queueIndex >= queue.length) {
        return; // 等待或無更多項目
      }

      const { item, index } = queue[queueIndex++];
      processing++;

      try {
        const itemId = item.id || `item_${index}`;
        let result = null;
        let lastError = null;
        let attempts = 0;

        // 重試邏輯
        while (attempts <= retries) {
          try {
            onProgress(itemId, 'processing', null, null);
            result = await worker(item);
            
            if (result === null || result === undefined || (result.skipped === true)) {
              results.set(itemId, { status: 'skipped', item, result, error: null });
              onProgress(itemId, 'skipped', null, null);
            } else if (result.error) {
              throw new Error(result.error);
            } else {
              results.set(itemId, { status: 'success', item, result, error: null });
              onProgress(itemId, 'success', result, null);
            }
            break; // 成功，跳出重試迴圈
          } catch (err) {
            lastError = err;
            attempts++;

            if (attempts <= retries) {
              const delayTime = retryDelays[attempts - 1] || 5000;
              onProgress(itemId, 'retry', null, `重試 ${attempts}/${retries}，等待 ${delayTime}ms...`);
              await sleep(delayTime);
            }
          }
        }

        if (lastError && attempts > retries) {
          results.set(itemId, { status: 'failed', item, result: null, error: lastError.message });
          onProgress(itemId, 'failed', null, lastError.message);
          errors.push({ item, error: lastError.message });
        }

        // 項目間延遲
        if (queueIndex < queue.length) {
          await sleep(delayMs);
        }
      } catch (err) {
        const itemId = item.id || `item_${index}`;
        results.set(itemId, { status: 'failed', item, result: null, error: err.message });
        onProgress(itemId, 'failed', null, err.message);
        errors.push({ item, error: err.message });
      } finally {
        processing--;
        processNext(); // 繼續處理下一個
      }
    };

    // 啟動並發處理
    for (let i = 0; i < concurrency; i++) {
      processNext();
    }
  });
}

/**
 * 生成 AI 回饋 - 單筆處理
 * item 必須包含 pureCode, assignment 物件, attemptId（前端已備好資料，不再做 DB lookup）
 */
export async function generateAIFeedbackForItem(item, base44, assignmentMap) {
  const { attemptId, assignmentId, pureCode, assignment } = item;

  if (!attemptId || !assignmentId) {
    return { skipped: true, reason: '缺少嘗試或任務 ID' };
  }
  if (!pureCode) {
    return { skipped: true, reason: '無程式碼內容' };
  }

  const asgn = assignment || assignmentMap.get(assignmentId);
  if (!asgn) {
    return { skipped: true, reason: '無法找到任務資料' };
  }

  const res = await base44.functions.invoke('generateFeedback', {
    code: pureCode,
    assignmentTitle: asgn.title || asgn.assignment_id || "作業",
    promptText: asgn.prompt_text || "",
    rubric: asgn.rubric || "",
    answer: asgn.answer || "",
    styleInstruction: "",
    mode: 'full',
    questionType: asgn.question_type || 'CodeProblem',
  });

  const feedback = res.data?.feedback;
  const suggestedRating = res.data?.suggestedRating;

  if (!feedback?.trim() && !suggestedRating) {
    return { skipped: true, reason: '無評語內容' };
  }

  const updateData = {};
  if (feedback?.trim()) updateData.teacher_feedback = feedback;
  if (suggestedRating) updateData.teacher_rating = suggestedRating;

  await base44.entities.Attempt.update(attemptId, updateData);
  return { success: true, feedback, suggestedRating };
}


/**
 * 生成 AI 等第 - 單筆處理
 * 統一使用 generateFeedback 後端（ratingOnly 模式），確保評分來源一致
 * item 必須包含 pureCode, assignment 物件, attemptId（前端已備好資料，不再做 DB lookup）
 */
export async function generateAIRatingForItem(item, base44, assignmentMap) {
  const { attemptId, assignmentId, pureCode, assignment } = item;

  if (!attemptId || !assignmentId) {
    return { skipped: true, reason: '缺少嘗試或任務 ID' };
  }
  if (!pureCode) {
    return { skipped: true, reason: '無程式碼內容' };
  }

  const asgn = assignment || assignmentMap.get(assignmentId);
  if (!asgn) {
    return { skipped: true, reason: '無法找到任務資料' };
  }

  const res = await base44.functions.invoke('generateFeedback', {
    code: pureCode,
    assignmentTitle: asgn.title || asgn.assignment_id || "作業",
    promptText: asgn.prompt_text || "",
    rubric: asgn.rubric || "",
    answer: asgn.answer || "",
    mode: 'ratingOnly',
    questionType: asgn.question_type || 'CodeProblem',
  });

  const rating = res.data?.suggestedRating;

  if (!rating) {
    return { skipped: true, reason: `無法解析等第（原始回應: ${JSON.stringify(res.data)}）` };
  }

  await base44.entities.Attempt.update(attemptId, { teacher_rating: rating });
  return { success: true, rating };
}