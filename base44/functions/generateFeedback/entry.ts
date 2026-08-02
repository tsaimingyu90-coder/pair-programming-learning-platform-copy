import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.warn('[generateFeedback] auth.me() failed (non-fatal):', authErr.message);
    }

    console.log(`[generateFeedback] user=${user?.email ?? 'service'} role=${user?.role ?? 'service'}`);

    const { code, assignmentTitle, promptText, rubric, answer, styleInstruction, mode, questionType } = await req.json();
    console.log(`[generateFeedback] mode=${mode} questionType=${questionType} title="${assignmentTitle}" codeLen=${code?.length ?? 0}`);

    if (!code || !assignmentTitle) {
      return Response.json({ error: 'Missing code or assignmentTitle' }, { status: 400 });
    }

    const ratingOnly = mode === 'ratingOnly';
    const isConcept = questionType === 'ConceptProblem';

    // ── Grade mapping helper ──────────────────────────────────────────────────
    // Total out of 10; Grade thresholds: 優≥9, 甲≥7, 乙≥5, 丙≥3, 丁<3
    const GRADE_HINT = `等第對應（總分10分）：
- 優：9–10 分
- 甲：7–8 分
- 乙：5–6 分
- 丙：3–4 分
- 丁：0–2 分`;

    let feedbackPrompt;

    if (isConcept) {
      // ── Concept Rubric ──────────────────────────────────────────────────────
      if (ratingOnly) {
        feedbackPrompt = `你是一個程式作業評分系統（問答題），請依照以下 Concept Rubric 進行評分，只輸出評分結果，不需要評語文字。

【任務】${assignmentTitle}
【題目內容】
${promptText || '(無詳細題目)'}
${rubric ? `\n【補充評分標準】\n${rubric}` : ''}
${answer ? `\n【參考解答】\n${answer}` : ''}

【學生作答】
${code}

【Concept Rubric評分構面】

1. Concept Accuracy（概念正確性）
- 0 = 完全錯誤或與題意無關
- 1 = 僅少部分正確（<50%），存在重大錯誤
- 2 = 部分正確（50–79%），仍有明顯錯誤
- 3 = 大致正確（≥80%），僅有小錯誤
- 4 = 完全正確，無錯誤

2. Reasoning（推理與解釋）
- 0 = 無推理或邏輯錯誤
- 1 = 推理不完整或部分錯誤
- 2 = 推理大致合理但不夠完整
- 3 = 推理清楚且邏輯完整

3. Completeness（回答完整性）
- 0 = 未回答或極度不完整
- 1 = 回答部分內容，但缺漏關鍵要點
- 2 = 回答完整，涵蓋所有重點

4. Clarity（表達清晰度）
- 0 = 表達混亂難以理解
- 1 = 表達清楚易理解

【特殊規則】
- 若 Concept Accuracy ≤1，Reasoning 不可超過 1 分
- 不可因文字長度或描述冗長而加分
- 若答案完整但核心概念錯誤，Completeness 可給分，但總體仍應落在低分區間
- 若未作答或完全離題，全部給 0 分

${GRADE_HINT}

請只輸出以下格式（不要其他文字）：
Concept Accuracy: X
Reasoning: X
Completeness: X
Clarity: X
Total: X/10
【建議等第】優/甲/乙/丙/丁（只能選一個）`;
      } else {
        feedbackPrompt = `你是一個程式作業評分系統（問答題），請依照以下 Concept Rubric 進行評分並提供回饋。

【任務】${assignmentTitle}
【題目內容】
${promptText || '(無詳細題目)'}
${rubric ? `\n【補充評分標準】\n${rubric}` : ''}
${answer ? `\n【參考解答】\n${answer}` : ''}

【學生作答】
${code}

【Concept Rubric評分構面】

1. Concept Accuracy（概念正確性）
- 0 = 完全錯誤或與題意無關
- 1 = 僅少部分正確（<50%），存在重大錯誤
- 2 = 部分正確（50–79%），仍有明顯錯誤
- 3 = 大致正確（≥80%），僅有小錯誤
- 4 = 完全正確，無錯誤

2. Reasoning（推理與解釋）
- 0 = 無推理或邏輯錯誤
- 1 = 推理不完整或部分錯誤
- 2 = 推理大致合理但不夠完整
- 3 = 推理清楚且邏輯完整

3. Completeness（回答完整性）
- 0 = 未回答或極度不完整
- 1 = 回答部分內容，但缺漏關鍵要點
- 2 = 回答完整，涵蓋所有重點

4. Clarity（表達清晰度）
- 0 = 表達混亂難以理解
- 1 = 表達清楚易理解

【特殊規則】
- 若 Concept Accuracy ≤1，Reasoning 不可超過 1 分
- 不可因文字長度或描述冗長而加分
- 若答案完整但核心概念錯誤，Completeness 可給分，但總體仍應落在低分區間
- 若未作答或完全離題，全部給 0 分

${GRADE_HINT}

請輸出以下格式（繁體中文）：
Concept Accuracy: X
Reasoning: X
Completeness: X
Clarity: X
Total: X/10
【建議等第】優/甲/乙/丙/丁（只能選一個）
Reason: 簡短說明（2句內）

並在評分結果後，額外提供：
1. 作答的優點（1-2 點）
2. 可改進的地方（1-2 點）
3. 學習建議（1 點）
${styleInstruction ? `\n【回應格式要求】\n${styleInstruction}` : ''}`;
      }
    } else {
      // ── Code Rubric ─────────────────────────────────────────────────────────
      if (ratingOnly) {
        feedbackPrompt = `你是一個程式作業評分系統（程式題），請依照以下 Code Rubric 進行評分，只輸出評分結果，不需要評語文字。

【任務】${assignmentTitle}
【題目內容】
${promptText || '(無詳細題目)'}
${rubric ? `\n【補充評分標準】\n${rubric}` : ''}
${answer ? `\n【參考解答】\n\`\`\`c\n${answer}\n\`\`\`` : ''}

【學生程式碼】
\`\`\`c
${code}
\`\`\`

【Code Rubric評分構面】

1. Syntax（語法正確性）
- 0 = 無法編譯或嚴重語法錯誤
- 1 = 可編譯但有錯誤或警告
- 2 = 完全正確

2. Functionality（功能正確性）
- 0 = 完全不符合題意
- 1 = 僅少部分正確（<50%）
- 2 = 部分正確（50–79%）
- 3 = 大致正確（≥80%）
- 4 = 完全符合題意

3. Comments（註解品質）
- 0 = 無註解或錯誤
- 1 = 有部分註解但不完整
- 2 = 註解清楚解釋邏輯

4. Readability（可讀性）
- 0 = 排版混亂
- 1 = 尚可閱讀
- 2 = 排版良好、結構清晰

【特殊規則】
- 若答案完全錯誤但很詳細，不可超過 Functionality=1
- 不可因篇幅長度加分

${GRADE_HINT}

請只輸出以下格式（不要其他文字）：
Syntax: X
Functionality: X
Comments: X
Readability: X
Total: X/10
【建議等第】優/甲/乙/丙/丁（只能選一個）`;
      } else {
        feedbackPrompt = `你是一個程式作業評分系統（程式題），請依照以下 Code Rubric 進行評分並提供回饋。

【任務】${assignmentTitle}
【題目內容】
${promptText || '(無詳細題目)'}
${rubric ? `\n【補充評分標準】\n${rubric}` : ''}
${answer ? `\n【參考解答】\n\`\`\`c\n${answer}\n\`\`\`` : ''}

【學生程式碼】
\`\`\`c
${code}
\`\`\`

【Code Rubric評分構面】

1. Syntax（語法正確性）
- 0 = 無法編譯或嚴重語法錯誤
- 1 = 可編譯但有錯誤或警告
- 2 = 完全正確

2. Functionality（功能正確性）
- 0 = 完全不符合題意
- 1 = 僅少部分正確（<50%）
- 2 = 部分正確（50–79%）
- 3 = 大致正確（≥80%）
- 4 = 完全符合題意

3. Comments（註解品質）
- 0 = 無註解或錯誤
- 1 = 有部分註解但不完整
- 2 = 註解清楚解釋邏輯

4. Readability（可讀性）
- 0 = 排版混亂
- 1 = 尚可閱讀
- 2 = 排版良好、結構清晰

【特殊規則】
- 若答案完全錯誤但很詳細，不可超過 Functionality=1
- 不可因篇幅長度加分

${GRADE_HINT}

請輸出以下格式（繁體中文）：
Syntax: X
Functionality: X
Comments: X
Readability: X
Total: X/10
【建議等第】優/甲/乙/丙/丁（只能選一個）
Reason: 簡短說明（2句內）

並在評分結果後，額外提供：
1. 程式碼的優點（1-2 點）
2. 可改進的地方（2-3 點，具體指出行號或邏輯）
3. 學習建議（1-2 點）
${styleInstruction ? `\n【回應格式要求】\n${styleInstruction}` : ''}`;
      }
    }

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: feedbackPrompt,
      model: 'gemini_3_flash',
    });

    // Extract suggested rating
    const ratingMatch = response.match(/【建議等第】\s*\*{0,2}(優|甲|乙|丙|丁)\*{0,2}/);
    const suggestedRating = ratingMatch ? ratingMatch[1] : null;
    console.log(`[generateFeedback] suggestedRating=${suggestedRating} rawLen=${response?.length}`);

    if (ratingOnly) {
      return Response.json({ suggestedRating });
    }

    // Remove the rating line from feedback text
    const feedbackText = response.replace(/【建議等第】\s*\*{0,2}(優|甲|乙|丙|丁)\*{0,2}/, '').trim();

    return Response.json({ feedback: feedbackText, suggestedRating });
  } catch (error) {
    console.error('[generateFeedback] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});