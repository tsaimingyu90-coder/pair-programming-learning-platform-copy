import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import SurveyProgressBar from "../components/SurveyProgressBar";
import PreviewBanner from "@/components/PreviewBanner";
import { usePreviewMode } from "@/hooks/usePreviewMode";

const ANXIETY_QUESTIONS = [
  { index: 1, section: "（一）自我信心焦慮", content: "我對自己的程式設計能力感到擔憂" },
  { index: 2, section: "（一）自我信心焦慮", content: "當程式變得複雜時，我會感到困惑" },
  { index: 3, section: "（一）自我信心焦慮", content: "我不信任自己能寫出正確的程式" },
  { index: 4, section: "（一）自我信心焦慮", content: "在學習程式設計時，我會感到緊張" },
  { index: 5, section: "（一）自我信心焦慮", content: "當課程內容涉及程式設計時，我會感到不安" },
  { index: 6, section: "（一）自我信心焦慮", content: "程式設計需要學習的內容太多，讓我感到害怕" },
  { index: 7, section: "（二）錯誤與除錯焦慮", content: "當我無法理解錯誤訊息時，我會感到焦慮" },
  { index: 8, section: "（二）錯誤與除錯焦慮", content: "程式中出現許多錯誤時，我會感到不安" },
  { index: 9, section: "（二）錯誤與除錯焦慮", content: "我會擔心在程式中出現錯誤" },
  { index: 10, section: "（二）錯誤與除錯焦慮", content: "當程式無法正常執行時，我會感到焦慮" },
  { index: 11, section: "（二）錯誤與除錯焦慮", content: "不斷進行除錯會讓我感到壓力" },
];

const EFFICACY_QUESTIONS = [
  { index: 1, section: "（一）基礎程式能力", content: "我有能力理解基本的程式語法" },
  { index: 2, section: "（一）基礎程式能力", content: "我能撰寫簡單的程式來解決問題" },
  { index: 3, section: "（一）基礎程式能力", content: "我可以閱讀並理解他人撰寫的程式碼" },
  { index: 4, section: "（一）基礎程式能力", content: "我能正確使用基本的程式指令" },
  { index: 5, section: "（二）進階問題解決能力", content: "我能設計程式來解決較複雜的問題" },
  { index: 6, section: "（二）進階問題解決能力", content: "我可以將問題拆解成可程式化的步驟" },
  { index: 7, section: "（二）進階問題解決能力", content: "我能規劃完整的程式邏輯流程" },
  { index: 8, section: "（二）進階問題解決能力", content: "我能選擇適當的程式方法來解決問題" },
  { index: 9, section: "（三）除錯能力", content: "我能找出程式中的錯誤" },
  { index: 10, section: "（三）除錯能力", content: "我可以修正程式錯誤並讓程式正常運作" },
  { index: 11, section: "（三）除錯能力", content: "當程式出現錯誤時，我知道如何處理" },
  { index: 12, section: "（三）除錯能力", content: "我能分析錯誤訊息並找出問題原因" },
  { index: 13, section: "（四）學習與應用能力", content: "我能學習新的程式概念" },
  { index: 14, section: "（四）學習與應用能力", content: "我能將所學應用到不同問題情境" },
  { index: 15, section: "（四）學習與應用能力", content: "我能獨立完成程式設計任務" },
  { index: 16, section: "（四）學習與應用能力", content: "我對提升程式能力有信心" },
];

const COLLABORATION_QUESTIONS = [
  { index: 1, section: "（一）互動與參與", content: "我在學習過程中能與AI夥伴進行有效的討論" },
  { index: 2, section: "（一）互動與參與", content: "我積極參與與AI夥伴的互動過程" },
  { index: 3, section: "（一）互動與參與", content: "與AI夥伴的小組討論有助於我理解課程內容" },
  { index: 4, section: "（二）知識建構", content: "與AI合作有助於我建構新的知識" },
  { index: 5, section: "（二）知識建構", content: "透過與AI討論，我能更深入理解程式設計概念" },
  { index: 6, section: "（二）知識建構", content: "與AI夥伴合作能幫助我解決學習上的問題" },
  { index: 7, section: "（三）支持感", content: "我能從AI夥伴獲得學習上的幫助" },
  { index: 8, section: "（三）支持感", content: "在與AI夥伴合作過程中，我感受到良好的支持與回饋" },
];

const LIKERT_LABELS = ["非常不同意", "不同意", "稍不同意", "中立", "稍同意", "同意", "非常同意"];

const glassCard = { background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.6)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" };

function LikertQuestion({ question, value, onChange, sectionLabel }) {
  return (
    <div className="p-5" style={glassCard}>
      {sectionLabel && (
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#007aff" }}>{sectionLabel}</p>
      )}
      <p className="text-sm font-medium mb-4" style={{ color: "#1d1d1f" }}>
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-bold mr-2" style={{ background: "rgba(0,122,255,0.12)", color: "#007aff" }}>{question.index}</span>
        {question.content}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map(score => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(question.index, score)}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs transition"
            style={value === score
              ? { background: "#007aff", color: "#fff", border: "1px solid #007aff" }
              : { background: "rgba(0,0,0,0.03)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.08)" }}
          >
            <span className="font-bold text-sm">{score}</span>
            <span className="leading-tight text-center hidden sm:block" style={{ fontSize: "10px" }}>
              {LIKERT_LABELS[score - 1]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1 px-1 sm:hidden">
        <span className="text-xs" style={{ color: "#aeaeb2" }}>非常不同意</span>
        <span className="text-xs" style={{ color: "#aeaeb2" }}>非常同意</span>
      </div>
    </div>
  );
}

export default function ScalePage() {
  const { isPreview } = usePreviewMode();
  const urlParams = new URLSearchParams(window.location.search);
  const surveyType = urlParams.get("type") || "pre";
  const part = urlParams.get("part") || "2"; // "2" = anxiety, "3" = efficacy
  const participantId = urlParams.get("id");

  const isAnxiety = part === "2";
  const isEfficacy = part === "3";
  const isCollaboration = part === "4";
  const partKey = isAnxiety ? "anxiety" : isEfficacy ? "efficacy" : "collaboration";
  const questions = isAnxiety ? ANXIETY_QUESTIONS : isEfficacy ? EFFICACY_QUESTIONS : COLLABORATION_QUESTIONS;

  const [participant, setParticipant] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [straightlineWarning, setStraightlineWarning] = useState(false);
  const [hasShownWarning, setHasShownWarning] = useState(false);

  useEffect(() => {
    const loadParticipant = async () => {
      let p = null;
      if (participantId) {
        const results = await base44.entities.Participant.filter({ participant_id: participantId });
        if (results.length > 0) {
          p = results[0];
          // PREVIEW GUARD: do not overwrite real participant sessionStorage in preview mode
          if (!isPreview) {
            sessionStorage.setItem("participant", JSON.stringify(p));
          }
          setParticipant(p);
        }
      } else {
        const stored = sessionStorage.getItem("participant");
        if (stored) {
          p = JSON.parse(stored);
          setParticipant(p);
        }
      }
      if (p && !isPreview) {
        const scaleResults = await base44.entities.ScaleResponse.filter({ participant: p.id, survey_type: surveyType, part: partKey });
        if (scaleResults.length > 0) {
          // Check for part-specific active unlock (only for pre-test parts)
          if (surveyType === "pre") {
            const partLabel = partKey === "anxiety" ? "P2" : "P3";
            const unlockLogs = await base44.entities.PretestUnlockLog.filter({ participant_db_id: p.id, is_active: true });
            const hasUnlock = unlockLogs.some(l => !l.pretest_part || l.pretest_part === partLabel);
            if (!hasUnlock) setAlreadyDone(true);
          } else {
            setAlreadyDone(true);
          }
        }
      }
    };
    loadParticipant();
  }, [surveyType, partKey, participantId]);

  const detectStraightlining = (currentAnswers, threshold = 5) => {
    const sorted = questions.map(q => currentAnswers[q.index]).filter(v => v !== undefined);
    for (let i = 0; i <= sorted.length - threshold; i++) {
      const slice = sorted.slice(i, i + threshold);
      if (slice.every(v => v === slice[0])) return true;
    }
    return false;
  };

  const handleChange = (index, score) => {
    const newAnswers = { ...answers, [index]: score };
    setAnswers(newAnswers);
    const detected = detectStraightlining(newAnswers);
    if (detected && !hasShownWarning) {
      setStraightlineWarning(true);
      setHasShownWarning(true);
    } else if (!detected) {
      setStraightlineWarning(false);
      setHasShownWarning(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  // Group questions by section for display
  const sections = [];
  let lastSection = null;
  questions.forEach(q => {
    if (q.section !== lastSection) {
      sections.push({ label: q.section, questions: [q] });
      lastSection = q.section;
    } else {
      sections[sections.length - 1].questions.push(q);
    }
  });

  const handleSubmit = async () => {
    if (!participant) return;
    setLoading(true);
    const total = Object.values(answers).reduce((sum, v) => sum + v, 0);
    if (!isPreview) {
      // Versioning: find existing records for this part
      const existing = await base44.entities.ScaleResponse.filter({ participant: participant.id, survey_type: surveyType, part: partKey });
      const nextVersion = existing.length + 1;
      const isOriginal = existing.length === 0;
      const now = new Date().toISOString();

      // Check for active unlock log (pre-test only)
      let unlockedBy = null;
      let unlockedAt = null;
      if (!isOriginal && surveyType === "pre") {
        const partLabel = partKey === "anxiety" ? "P2" : "P3";
        const unlockLogs = await base44.entities.PretestUnlockLog.filter({ participant_db_id: participant.id, is_active: true });
        const activeLog = unlockLogs.find(l => !l.pretest_part || l.pretest_part === partLabel);
        if (activeLog) {
          unlockedBy = activeLog.unlocked_by;
          unlockedAt = activeLog.unlocked_at;
          await Promise.all(existing.filter(r => r.is_latest).map(r =>
            base44.entities.ScaleResponse.update(r.id, { is_latest: false })
          ));
          await base44.entities.PretestUnlockLog.update(activeLog.id, { is_active: false });
        }
      }

      await base44.entities.ScaleResponse.create({
        participant: participant.id,
        survey_type: surveyType,
        part: partKey,
        answers,
        total_score: total,
        timestamp: now,
        version_no: nextVersion,
        is_original: isOriginal,
        is_latest: true,
        unlocked_by: unlockedBy,
        unlocked_at: unlockedAt,
      });
    } else {
      console.log("[ScalePage][Preview] skipped writing ScaleResponse");
    }
    setLoading(false);
    setSubmitted(true);
  };

  if (!participant) {
    if (isPreview) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500">載入預覽資料中...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">請先進行 Check-in</p>
          <a href={createPageUrl("CheckIn")} className="text-blue-600 underline text-sm">前往 Check-in</a>
        </div>
      </div>
    );
  }

  if (submitted) {
    const previewSuffix = isPreview ? "&preview=1" : "";
    const previewParticipantId = participant?.participant_id;
    let nextHref, nextLabel, doneLabel;
    if (isAnxiety) {
      nextHref = `/ScalePage?type=${surveyType}&part=3&id=${participant.participant_id}${previewSuffix}`;
      nextLabel = "繼續第三部分 →";
      doneLabel = "第二部分完成";
    } else if (isEfficacy && surveyType === "post") {
      nextHref = `/ScalePage?type=${surveyType}&part=4&id=${participant.participant_id}${previewSuffix}`;
      nextLabel = "繼續第四部分 →";
      doneLabel = "第三部分完成";
    } else if (isCollaboration || (isEfficacy && surveyType === "pre")) {
      nextHref = isPreview && previewParticipantId ? `/WeekSelection/preview/${previewParticipantId}` : `/WeekSelection`;
      nextLabel = "前往任務總覽 →";
      doneLabel = isCollaboration ? "第四部分完成" : "第三部分完成";
    } else {
      nextHref = isPreview && previewParticipantId ? `/WeekSelection/preview/${previewParticipantId}` : `/WeekSelection`;
      nextLabel = "前往任務總覽 →";
      doneLabel = "完成";
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)" }}>
        {isPreview && <PreviewBanner />}
        <div className="p-10 text-center max-w-sm w-full" style={{ ...glassCard, border: "1px solid rgba(52,199,89,0.3)" }}>
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "#1d1d1f" }}>{doneLabel}</h2>
          <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>{isPreview ? "此為預覽模式，未寫入正式資料。" : "感謝您的作答。"}</p>
          <a href={nextHref} className="block w-full py-2.5 rounded-xl text-sm font-semibold transition" style={{ background: "#007aff", color: "#fff" }}>
            {nextLabel}
          </a>
        </div>
      </div>
    );
  }

  if (alreadyDone) {
    let nextHref, nextLabel;
    if (isAnxiety) {
      nextHref = `/ScalePage?type=${surveyType}&part=3&id=${participant.participant_id}`;
      nextLabel = "繼續第三部分 →";
    } else if (isEfficacy && surveyType === "post") {
      nextHref = `/ScalePage?type=${surveyType}&part=4&id=${participant.participant_id}`;
      nextLabel = "繼續第四部分 →";
    } else {
      nextHref = `/WeekSelection`;
      nextLabel = "前往任務總覽 →";
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)" }}>
        <div className="p-10 text-center max-w-sm w-full" style={{ ...glassCard, border: "1px solid rgba(255,200,50,0.3)" }}>
          <div className="text-4xl mb-3">📋</div>
          <h2 className="text-xl font-semibold mb-1" style={{ color: "#1d1d1f" }}>已完成作答</h2>
          <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>您已提交過此部分問卷。</p>
          <a href={nextHref} className="inline-block px-6 py-2.5 rounded-xl text-sm font-medium transition" style={{ background: "#007aff", color: "#fff" }}>
            {nextLabel}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)" }}>
      {isPreview && <PreviewBanner />}
      <div className="p-4">
      <div className="max-w-2xl mx-auto">
        <SurveyProgressBar currentStep={isAnxiety ? 2 : isEfficacy ? 3 : 4} totalSteps={surveyType === "post" ? 4 : 3} />

        <div className="p-5 mb-4 sticky top-4 z-10" style={glassCard}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "#1d1d1f" }}>
                {isAnxiety ? "第二部分" : isEfficacy ? "第三部分" : "第四部分"}：{isAnxiety ? "程式設計焦慮量表" : isEfficacy ? "自我效能感量表" : "協作學習知覺量表"}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>參與者：{participant.participant_id} · 共 {totalQuestions} 題</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold" style={{ color: answeredCount === totalQuestions ? "#34c759" : "#8e8e93" }}>
                {answeredCount} / {totalQuestions}
              </span>
              <p className="text-xs" style={{ color: "#aeaeb2" }}>已作答</p>
            </div>
          </div>
          {answeredCount === totalQuestions && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition"
              style={{ background: "#34c759", color: "#fff" }}
            >
              {loading ? "提交中…" : "✓ 提交答案"}
            </button>
          )}
        </div>

        {(isEfficacy || isCollaboration || isAnxiety) && (
          <div className="rounded-xl p-5 mb-4 text-sm leading-relaxed space-y-2" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.15)" }}>
            <p style={{ color: "#3a3a3c" }}>各位同學您好：</p>
            {isAnxiety && <p style={{ color: "#3a3a3c" }}>本問卷為「程式設計焦慮量表」，旨在瞭解您在程式設計學習過程中的實際感受。</p>}
            {isEfficacy && <p style={{ color: "#3a3a3c" }}>本問卷為「程式設計自我效能量表」，旨在瞭解您在程式設計學習過程中，對自己能力與表現的信心程度。</p>}
            {isCollaboration && <p style={{ color: "#3a3a3c" }}>本問卷為「協作學習知覺量表」，旨在瞭解您在與AI夥伴合作學習過程中的感受與體驗。</p>}
            <p style={{ color: "#3a3a3c" }}>本問卷並非考試，不會影響您的成績，也沒有標準答案，請依您的真實情況填答。</p>
            <p style={{ color: "#3a3a3c" }}><span className="font-semibold" style={{ color: "#1d1d1f" }}>請特別注意：</span>本問卷每一題所描述的情境不同，請逐題閱讀並依實際感受作答，避免全部填寫相同答案。</p>
            <p style={{ color: "#3a3a3c" }}>本問卷資料僅用於教學與研究分析，並採匿名處理，請安心填寫。</p>
            <p className="font-semibold" style={{ color: "#007aff" }}>感謝您的配合！</p>
          </div>
        )}

        <div
          className={`sticky z-20 transition-all duration-300 ${straightlineWarning ? "opacity-100 mb-4" : "opacity-0 pointer-events-none h-0 overflow-hidden mb-0"}`}
          style={{ top: "calc(1rem + 72px)" }}
        >
          <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.3)", boxShadow: "0 4px 16px rgba(255,149,0,0.15)" }}>
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#92400e" }}>你目前已連續 5 題選擇相同答案，請再次確認每一題是否都符合你的真實情況。</p>
              <p className="text-xs mt-1" style={{ color: "#b45309" }}>若這確實是你的真實感受，仍可繼續作答。</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx}>
              {section.questions.map(q => (
                <LikertQuestion
                  key={q.index}
                  question={q}
                  value={answers[q.index]}
                  onChange={handleChange}
                  sectionLabel={q.index === 1 || (idx > 0 && q.index === sections[idx - 1].questions.length + 1) ? section.label : null}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6 mb-8">
          <button
            onClick={handleSubmit}
            disabled={loading || answeredCount < totalQuestions}
            className="w-full py-3 rounded-2xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            style={{ background: isPreview ? "#f97316" : "#34c759", color: "#fff", boxShadow: "0 2px 12px rgba(52,199,89,0.25)" }}
          >
            {loading ? "提交中…" : answeredCount < totalQuestions ? `尚有 ${totalQuestions - answeredCount} 題未作答` : isPreview ? "✓ 預覽提交（不寫入正式資料）" : "✓ 提交答案"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}