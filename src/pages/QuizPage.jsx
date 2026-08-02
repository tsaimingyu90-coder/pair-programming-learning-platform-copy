import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import SurveyProgressBar from "../components/SurveyProgressBar";
import PreviewBanner from "@/components/PreviewBanner";
import { usePreviewMode } from "@/hooks/usePreviewMode";

const OPTIONS = ["A", "B", "C", "D"];

export default function QuizPage() {
  const { isPreview } = usePreviewMode();
  const urlParams = new URLSearchParams(window.location.search);
  const surveyType = urlParams.get("type") || "pre";
  const participantId = urlParams.get("id");

  const [participant, setParticipant] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);

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
        const quizResults = await base44.entities.QuizResult.filter({ participant: p.id, survey_type: surveyType });
        if (quizResults.length > 0) {
          // Check if there's an active P1-specific unlock
          const unlockLogs = await base44.entities.PretestUnlockLog.filter({ participant_db_id: p.id, is_active: true });
          const hasP1Unlock = unlockLogs.some(l => !l.pretest_part || l.pretest_part === "P1");
          if (!hasP1Unlock) setAlreadyDone(true);
        }
      }
    };
    loadParticipant();
    base44.entities.QuestionBank.filter({ survey_type: surveyType })
      .then(qs => {
        setQuestions(qs.sort((a, b) => a.questionNumber - b.questionNumber));
        setLoadingQuestions(false);
      });
  }, [surveyType, participantId]);

  const handleSelect = (questionNumber, option) => {
    setAnswers(prev => ({ ...prev, [questionNumber]: option }));
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  const handleSubmit = async () => {
    if (!participant) return;
    setLoading(true);
    let totalScore = 0;
    questions.forEach(q => {
      if (answers[q.questionNumber] === q.correctAnswer) totalScore += 4;
    });
    setScore(totalScore);
    if (!isPreview) {
      // Versioning: find existing records to determine version_no and is_original
      const existing = await base44.entities.QuizResult.filter({ participant: participant.id, survey_type: surveyType });
      const nextVersion = existing.length + 1;
      const isOriginal = existing.length === 0;
      const now = new Date().toISOString();

      // Check for active unlock log to capture who unlocked
      let unlockedBy = null;
      let unlockedAt = null;
      if (!isOriginal) {
        const unlockLogs = await base44.entities.PretestUnlockLog.filter({ participant_db_id: participant.id, is_active: true });
        const activeLog = unlockLogs.find(l => !l.pretest_part || l.pretest_part === "P1");
        if (activeLog) {
          unlockedBy = activeLog.unlocked_by;
          unlockedAt = activeLog.unlocked_at;
          await Promise.all(existing.filter(r => r.is_latest).map(r =>
            base44.entities.QuizResult.update(r.id, { is_latest: false })
          ));
          await base44.entities.PretestUnlockLog.update(activeLog.id, { is_active: false });
        }
      }

      await base44.entities.QuizResult.create({
        participant: participant.id,
        survey_type: surveyType,
        answers,
        score: totalScore,
        timestamp: now,
        version_no: nextVersion,
        is_original: isOriginal,
        is_latest: true,
        unlocked_by: unlockedBy,
        unlocked_at: unlockedAt,
      });
    } else {
      console.log("[QuizPage][Preview] skipped writing QuizResult");
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

  if (loadingQuestions) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const glassCard = { background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.6)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" };

  if (alreadyDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)" }}>
        <div className="p-10 text-center max-w-sm w-full" style={{ ...glassCard, border: "1px solid rgba(255,200,50,0.3)" }}>
          <div className="text-4xl mb-3">📋</div>
          <h2 className="text-xl font-semibold mb-1" style={{ color: "#1d1d1f" }}>已完成作答</h2>
          <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>您已提交過此{surveyType === "pre" ? "前測" : "後測"}問卷。</p>
          <a href={createPageUrl("SurveyPage")} className="inline-block px-6 py-2.5 rounded-xl text-sm font-medium transition" style={{ background: "#007aff", color: "#fff" }}>
            前往調查問卷
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    const previewSuffix = isPreview ? "&preview=1" : "";
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)" }}>
        {isPreview && <PreviewBanner />}
        <div className="p-10 text-center max-w-sm w-full" style={{ ...glassCard, border: "1px solid rgba(52,199,89,0.3)" }}>
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-semibold mb-1" style={{ color: "#1d1d1f" }}>{isPreview ? "預覽提交完成！" : "作答完成！"}</h2>
          {isPreview && <p className="text-sm mb-2" style={{ color: "#b45309" }}>此為預覽模式，未寫入正式資料</p>}
          <a href={`/ScalePage?type=${surveyType}&part=2&id=${participant.participant_id}${previewSuffix}`} className="block w-full py-2.5 rounded-xl text-sm font-semibold transition mt-4" style={{ background: "#007aff", color: "#fff" }}>
            進行第二部分 →
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
        <SurveyProgressBar currentStep={1} totalSteps={surveyType === "post" ? 4 : 3} />

        {/* Header */}
        <div className="p-5 mb-4 sticky top-4 z-10" style={glassCard}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "#1d1d1f" }}>
                第一部分：{surveyType === "pre" ? "前測" : "後測"}程式知識測驗
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>參與者：{participant.participant_id} · 共 {totalQuestions} 題，每題 4 分</p>
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

        {/* Intro */}
        <div className="rounded-xl p-5 mb-4 text-sm leading-relaxed space-y-2" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.15)" }}>
          <p style={{ color: "#3a3a3c" }}>各位同學您好：</p>
          <p style={{ color: "#3a3a3c" }}>本測驗為「{surveyType === "post" ? "後測" : "前測"}程式知識測驗」，旨在評估您目前在程式設計相關概念與基礎知識的掌握程度。</p>
          <p style={{ color: "#3a3a3c" }}>本測驗並非正式考試，不會影響您的學期成績，請依您目前的實際能力與理解進行作答。</p>
          <p style={{ color: "#3a3a3c" }}><span className="font-semibold" style={{ color: "#1d1d1f" }}>請特別注意：</span>本測驗每一題皆有正確答案，請逐題仔細閱讀後再作答。請避免隨意作答或全部填寫相同選項，以確保測驗結果能真實反映您的學習狀況。</p>
          <p style={{ color: "#3a3a3c" }}>本測驗結果僅用於教學與研究分析，並採匿名方式處理，請安心作答。</p>
          <p className="font-semibold" style={{ color: "#007aff" }}>感謝您的配合！</p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-5 transition" style={{ ...glassCard, border: answers[q.questionNumber] ? "1px solid rgba(0,122,255,0.3)" : "1px solid rgba(255,255,255,0.6)" }}>
              <p className="text-sm font-semibold mb-3" style={{ color: "#1d1d1f" }}>
                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-bold mr-2" style={{ background: "rgba(0,122,255,0.12)", color: "#007aff" }}>{idx + 1}</span>
                {q.questionContent}
              </p>
              <div className="space-y-2">
                {OPTIONS.map(opt => {
                  const content = q[`Option${opt}_Content`];
                  const selected = answers[q.questionNumber] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(q.questionNumber, opt)}
                      className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-3"
                      style={selected
                        ? { background: "#007aff", color: "#fff", border: "1px solid #007aff" }
                        : { background: "rgba(0,0,0,0.03)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.08)" }}
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                        style={selected ? { borderColor: "rgba(255,255,255,0.6)", color: "#fff" } : { borderColor: "rgba(0,0,0,0.2)", color: "#6e6e73" }}>
                        {opt}
                      </span>
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Submit */}
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