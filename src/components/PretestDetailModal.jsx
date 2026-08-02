import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Quiz: 10 questions, each scored 10pts
// Anxiety scale: 11 questions, 1-7
// Efficacy scale: 16 questions, 1-7

const ANXIETY_QUESTIONS = [
  "我對自己的程式設計能力感到擔憂",
  "當程式變得複雜時，我會感到困惑",
  "我不信任自己能寫出正確的程式",
  "在學習程式設計時，我會感到緊張",
  "當課程內容涉及程式設計時，我會感到不安",
  "程式設計需要學習的內容太多，讓我感到害怕",
  "當我無法理解錯誤訊息時，我會感到焦慮",
  "程式中出現許多錯誤時，我會感到不安",
  "我會擔心在程式中出現錯誤",
  "當程式無法正常執行時，我會感到焦慮",
  "不斷進行除錯會讓我感到壓力",
];

const EFFICACY_QUESTIONS = [
  "我有能力理解基本的程式語法",
  "我能撰寫簡單的程式來解決問題",
  "我可以閱讀並理解他人撰寫的程式碼",
  "我能正確使用基本的程式指令",
  "我能設計程式來解決較複雜的問題",
  "我可以將問題拆解成可程式化的步驟",
  "我能規劃完整的程式邏輯流程",
  "我能選擇適當的程式方法來解決問題",
  "我能找出程式中的錯誤",
  "我可以修正程式錯誤並讓程式正常運作",
  "當程式出現錯誤時，我知道如何處理",
  "我能分析錯誤訊息並找出問題原因",
  "我能學習新的程式概念",
  "我能將所學應用到不同問題情境",
  "我能獨立完成程式設計任務",
  "我對提升程式能力有信心",
];

const COLLABORATION_QUESTIONS = [
  "我在學習過程中能與AI夥伴進行有效的討論",
  "我積極參與與AI夥伴的互動過程",
  "與AI夥伴的小組討論有助於我理解課程內容",
  "與AI合作有助於我建構新的知識",
  "透過與AI討論，我能更深入理解程式設計概念",
  "與AI夥伴合作能幫助我解決學習上的問題",
  "我能從AI夥伴獲得學習上的幫助",
  "在與AI夥伴合作過程中，我感受到良好的支持與回饋",
];

const SCALE_LABELS = ["非常不同意", "不同意", "有點不同意", "普通", "有點同意", "同意", "非常同意"];

export default function PretestDetailModal({ type, quizResults, scaleResponses, postQuizResults, postScaleResponses, questionBank, onClose, hidePreTab }) {
  // type: "quiz" | "anxiety" | "efficacy" | "collaboration"

  const isQuiz = type === "quiz";
  const isAnxiety = type === "anxiety";
  const isEfficacy = type === "efficacy";
  const isCollaboration = type === "collaboration";

  const [surveyTab, setSurveyTab] = useState(hidePreTab ? "post" : "pre"); // "pre" | "post"
  const [activeIdx, setActiveIdx] = useState(0);

  // Pick data source based on tab
  const activeQuizResults = surveyTab === "pre" ? quizResults : (postQuizResults || []);
  const activeScaleResponses = surveyTab === "pre" ? scaleResponses : (postScaleResponses || []);

  // Sort by version descending (latest first)
  const versions = isQuiz
    ? [...activeQuizResults].sort((a, b) => (b.version_no || 1) - (a.version_no || 1))
    : isAnxiety
    ? [...activeScaleResponses.filter(s => s.part === "anxiety")].sort((a, b) => (b.version_no || 1) - (a.version_no || 1))
    : isEfficacy
    ? [...activeScaleResponses.filter(s => s.part === "efficacy")].sort((a, b) => (b.version_no || 1) - (a.version_no || 1))
    : [...activeScaleResponses.filter(s => s.part === "collaboration")].sort((a, b) => (b.version_no || 1) - (a.version_no || 1));

  // Reset activeIdx when tab or versions change
  useEffect(() => { setActiveIdx(0); }, [surveyTab]);

  const record = versions[activeIdx];

  const title = isQuiz ? "學習成就測驗" : isAnxiety ? "程式設計焦慮量表" : isEfficacy ? "自我效能感量表" : "協作學習知覺量表";
  const questions = isQuiz ? null : isAnxiety ? ANXIETY_QUESTIONS : isEfficacy ? EFFICACY_QUESTIONS : COLLABORATION_QUESTIONS;

  // Check if post data exists for this type
  const hasPostData = isQuiz
    ? (postQuizResults || []).length > 0
    : isAnxiety
    ? (postScaleResponses || []).filter(s => s.part === "anxiety").length > 0
    : isEfficacy
    ? (postScaleResponses || []).filter(s => s.part === "efficacy").length > 0
    : (postScaleResponses || []).filter(s => s.part === "collaboration").length > 0;

  // Sort question bank by questionNumber, filtered by survey_type
  const sortedQBank = [...(questionBank || [])]
    .filter(q => !q.survey_type || q.survey_type === surveyTab)
    .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));

  const answers = record?.answers || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {record && (
              <p className="text-xs text-gray-400 mt-0.5">
                {record.timestamp ? new Date(record.timestamp).toLocaleString("zh-TW") : ""}
                {isQuiz && <span className="ml-2 font-semibold text-blue-600">得分：{record.score}/100</span>}
                {!isQuiz && <span className="ml-2 font-semibold text-blue-600">總分：{record.total_score}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Pre/Post tab */}
            {!hidePreTab && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setSurveyTab("pre")}
                  className={`text-xs px-3 py-1.5 font-medium transition ${surveyTab === "pre" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >前測</button>
                <button
                  onClick={() => setSurveyTab("post")}
                  className={`text-xs px-3 py-1.5 font-medium transition border-l border-gray-200 ${surveyTab === "post" ? "bg-green-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"} ${!hasPostData ? "opacity-40 cursor-not-allowed" : ""}`}
                  disabled={!hasPostData}
                >後測{!hasPostData && " (無資料)"}</button>
              </div>
            )}
            {versions.length > 1 && (
              <div className="flex gap-1">
                {versions.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIdx(i)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition ${
                      activeIdx === i
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    v{v.version_no || 1}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {!record && (
            <div className="py-12 text-center text-gray-400 text-sm">尚無{surveyTab === "pre" ? "前測" : "後測"}作答記錄</div>
          )}
          {record && isQuiz && sortedQBank.map((q, idx) => {
            const qNum = q.questionNumber;
            const selected = answers[qNum] || answers[String(qNum)];
            const correct = q.correctAnswer;
            const isCorrect = selected === correct;
            return (
              <div key={qNum} className={`rounded-lg border p-3 ${isCorrect ? "bg-green-50 border-green-200" : selected ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                <p className="text-xs font-semibold text-gray-700 mb-2">Q{qNum}. {q.questionContent}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {["A", "B", "C", "D"].map(opt => {
                    const content = q[`Option${opt}_Content`];
                    if (!content) return null;
                    const isSelected = selected === opt;
                    const isCorrectOpt = correct === opt;
                    return (
                      <div key={opt} className={`text-xs px-2.5 py-1.5 rounded border font-medium ${
                        isCorrectOpt ? "bg-green-200 text-green-800 border-green-400" :
                        isSelected && !isCorrectOpt ? "bg-red-200 text-red-800 border-red-400" :
                        "bg-white text-gray-600 border-gray-200"
                      }`}>
                        <span className="font-bold mr-1">{opt}.</span>{content}
                        {isCorrectOpt && <span className="ml-1">✓</span>}
                        {isSelected && !isCorrectOpt && <span className="ml-1">✗</span>}
                      </div>
                    );
                  })}
                </div>
                {!selected && <p className="text-xs text-gray-400 mt-1">（未作答）</p>}
              </div>
            );
          })}

          {record && !isQuiz && questions && questions.map((q, idx) => {
            const qIdx = idx; // 0-based index
            // answers object may use 0-based or 1-based index
            const score = answers[qIdx] ?? answers[idx + 1] ?? answers[String(qIdx)] ?? answers[String(idx + 1)];
            return (
              <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white">
                <p className="text-xs font-semibold text-gray-700 mb-2">Q{idx + 1}. {q}</p>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7].map(v => (
                    <div key={v} className={`flex flex-col items-center gap-0.5`}>
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition ${
                        score == v
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-200 text-gray-400"
                      }`}>
                        {v}
                      </div>
                    </div>
                  ))}
                  {score != null && (
                    <span className="ml-2 self-center text-xs text-blue-600 font-semibold">
                      {SCALE_LABELS[(score || 1) - 1]}
                    </span>
                  )}
                </div>
                {score == null && <p className="text-xs text-gray-400 mt-1">（未作答）</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}