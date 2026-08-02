import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { usePreview } from "@/lib/PreviewContext";
import PreviewBanner from "@/components/PreviewBanner";

export default function WeekSelectionPreview() {
  const { participantId } = useParams();
  const { setPreviewMode } = usePreview();

  const [participant, setParticipant] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [availabilities, setAvailabilities] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResults, setScaleResults] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      if (!participantId) {
        setError("請提供參與者編號");
        setLoading(false);
        return;
      }

      try {
        // Find participant by participant_id
        const results = await base44.entities.Participant.filter({ participant_id: participantId });
        if (results.length === 0) {
          setError(`找不到參與者：${participantId}`);
          setLoading(false);
          return;
        }

        const p = results[0];
        setParticipant(p);

        // Generate unique preview session ID (read-only, no writes to production)
        const previewSessionId = `preview_${participantId}_${Date.now()}`;
        sessionStorage.setItem("preview_session_id", previewSessionId);

        // Set preview mode in context
        setPreviewMode(true, participantId, p);

        // Load all data in parallel (READ ONLY — no writes)
        const [assignmentData, avData, attemptData, quizData, scaleData, chatData] = await Promise.all([
          base44.entities.Assignment.list(),
          p?.class_id ? base44.entities.AssignmentAvailability.filter({ class_id: p.class_id }) : Promise.resolve([]),
          base44.entities.Attempt.filter({ participant: p.id }, '-updated_date', 200),
          base44.entities.QuizResult.filter({ participant: p.id }),
          base44.entities.ScaleResponse.filter({ participant: p.id }),
          base44.entities.ChatLog.filter({ participant: p.id }, '-timestamp', 500),
        ]);

        setAssignments(assignmentData);
        setAvailabilities(avData);
        setAttempts(attemptData);
        setQuizResults(quizData);
        setScaleResults(scaleData);
        setChatLogs(chatData);
        setLoading(false);
      } catch (err) {
        console.error("[WeekSelectionPreview] load error:", err);
        setError("無法載入預覽資料");
        setLoading(false);
      }
    };

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">載入預覽資料中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl border border-red-200 p-10 max-w-sm mx-auto">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">無法載入預覽</h2>
          <p className="text-sm text-gray-500 mb-5">{error}</p>
          <a href="/Home" className="inline-block px-5 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition">
            返回首頁
          </a>
        </div>
      </div>
    );
  }

  // Group assignments by week
  const weekGroups = {};
  assignments.filter(a => a.week_number).forEach(a => {
    if (!weekGroups[a.week_number]) weekGroups[a.week_number] = [];
    weekGroups[a.week_number].push(a);
  });
  Object.keys(weekGroups).forEach(week => {
    weekGroups[week].sort((a, b) => a.task_number - b.task_number);
  });
  const weeks = Object.keys(weekGroups).sort((a, b) => Number(a) - Number(b));

  const getAssignmentId = (obj) => obj?.assignment?.id || obj?.assignment || obj?.assignment_id;

  // Helper: get attempt status for a task
  const getTaskStatus = (taskId) => {
    const completed = attempts.find(a => getAssignmentId(a) === taskId && a.end_ts);
    const inProgress = attempts.find(a => getAssignmentId(a) === taskId && !a.end_ts);
    if (completed) return { status: "completed", attempt: completed };
    if (inProgress) return { status: "inProgress", attempt: inProgress };
    return { status: "notStarted", attempt: null };
  };

  // Helper: quiz/scale status
  const preQuizDone = quizResults.some(r => r.survey_type === "pre");
  const postQuizDone = quizResults.some(r => r.survey_type === "post");
  const preAnxietyDone = scaleResults.some(r => r.survey_type === "pre" && r.part === "anxiety");
  const preEfficacyDone = scaleResults.some(r => r.survey_type === "pre" && r.part === "efficacy");
  const postAnxietyDone = scaleResults.some(r => r.survey_type === "post" && r.part === "anxiety");
  const postEfficacyDone = scaleResults.some(r => r.survey_type === "post" && r.part === "efficacy");
  const preAllDone = preQuizDone && preAnxietyDone && preEfficacyDone;
  const postAllDone = postQuizDone && postAnxietyDone && postEfficacyDone;

  // Helper: has chat logs for an attempt
  const attemptHasChat = (attemptId) => chatLogs.some(c => c.attempt === attemptId);

  const SurveyStatusBadge = ({ done, label }) => (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium ${
      done ? "bg-green-50 border-green-300 text-green-800" : "bg-gray-50 border-gray-200 text-gray-500"
    }`}>
      <span>{label}</span>
      <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
        done ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-500"
      }`}>
        {done ? "✓ 已提交" : "○ 未提交"}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PreviewBanner />
      <div className="p-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-amber-200 p-5 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  任務選單 <span className="text-amber-500 text-lg">(教師預覽)</span>
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  預覽參與者：<span className="font-medium text-gray-700">{participant.participant_id}</span>
                  {participant.name && <> · 姓名：<span className="font-medium text-gray-700">{participant.name}</span></>}
                  {participant.class_id && <> · 班級：<span className="font-medium text-gray-700">{participant.class_id}</span></>}
                  · 隊伍：<span className="font-medium text-gray-700">{participant.group}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-gray-400">
                <span>嘗試數：{attempts.length}</span>
                <span>聊天記錄：{chatLogs.length} 則</span>
              </div>
            </div>
          </div>

          {/* Pre-test status */}
          <div className={`rounded-2xl border p-5 mb-6 ${preAllDone ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-300"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base font-bold text-gray-800">
                {preAllDone ? "✅" : "⚠️"} 前測狀況（唯讀）
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <SurveyStatusBadge done={preQuizDone} label="第一部分：學習成就測驗" />
              <SurveyStatusBadge done={preAnxietyDone} label="第二部分：程式設計焦慮量表" />
              <SurveyStatusBadge done={preEfficacyDone} label="第三部分：自我效能感量表" />
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <a href={`/QuizPage?type=pre&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽前測知識測驗 →
              </a>
              <a href={`/ScalePage?type=pre&part=2&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽焦慮量表 →
              </a>
              <a href={`/ScalePage?type=pre&part=3&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽自我效能感量表 →
              </a>
            </div>
          </div>

          {/* Week task cards */}
          {weeks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500">目前沒有可用的任務</p>
            </div>
          ) : (
            <div className="space-y-6">
              {weeks.map(weekNum => (
                <div key={weekNum} className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">第 {weekNum} 週</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {weekGroups[weekNum].map(task => {
                      const classAv = availabilities.find(av => getAssignmentId(av) === task.id);
                      const isNotOpen = classAv !== undefined ? !classAv.is_open : task.is_open !== true;
                      const { status, attempt } = getTaskStatus(task.id);
                      const hasChat = attempt ? attemptHasChat(attempt.id) : false;
                      const isRated = attempt?.teacher_rating;
                      const taskUrl = `/TaskPage?week=${task.week_number}&task=${task.task_number}&pid=${participant.id}&preview=1`;

                      const statusConfig = {
                        completed: { label: "✓ 已提交", bg: "bg-green-50", border: "border-green-300", badge: "bg-green-600 text-white", numColor: "text-green-700" },
                        inProgress: { label: "◐ 進行中", bg: "bg-blue-50", border: "border-blue-300", badge: "bg-blue-600 text-white", numColor: "text-blue-700" },
                        notStarted: { label: "○ 未開始", bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-400 text-white", numColor: "text-gray-600" },
                      }[status];

                      return (
                        <a
                          key={task.id}
                          href={taskUrl}
                          className={`flex flex-col border rounded-xl p-3 text-center transition group relative ${statusConfig.bg} ${statusConfig.border} hover:opacity-90`}
                        >
                          {isNotOpen && (
                            <div className="absolute top-1.5 left-1.5">
                              <span className="text-xs bg-gray-400 text-white px-1.5 py-0.5 rounded-full">🔒</span>
                            </div>
                          )}
                          <div className="flex flex-row gap-1 flex-wrap justify-center items-center mb-2 min-h-6 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${statusConfig.badge}`}>
                              {statusConfig.label}
                            </span>
                            {isRated && (
                              <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                                {attempt.teacher_rating}
                              </span>
                            )}
                          </div>
                          <div className={`text-2xl font-bold ${statusConfig.numColor}`}>T{task.task_number}</div>
                          <div className="text-xs text-gray-500 truncate mt-1" title={task.title}>
                            {task.title || `任務 ${task.task_number}`}
                          </div>
                          <div className={`mt-1.5 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full self-center ${
                            task.allow_ai ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {task.allow_ai ? "AI ✓" : "AI ✗"}
                          </div>
                          {attempt && (
                            <div className="mt-1.5 flex justify-center gap-1 flex-wrap">
                              {hasChat && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">💬 有對話</span>}
                              {attempt.end_ts && (
                                <span className="text-xs text-gray-400">{new Date(attempt.end_ts).toLocaleDateString('zh-TW')}</span>
                              )}
                            </div>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Post-test status */}
          <div className={`rounded-2xl border p-5 mt-6 ${postAllDone ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base font-bold text-gray-800">
                {postAllDone ? "✅" : "—"} 後測狀況（唯讀）
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <SurveyStatusBadge done={postQuizDone} label="第一部分：學習成就測驗" />
              <SurveyStatusBadge done={postAnxietyDone} label="第二部分：程式設計焦慮量表" />
              <SurveyStatusBadge done={postEfficacyDone} label="第三部分：自我效能感量表" />
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <a href={`/QuizPage?type=post&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽後測知識測驗 →
              </a>
              <a href={`/ScalePage?type=post&part=2&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽後測焦慮量表 →
              </a>
              <a href={`/ScalePage?type=post&part=3&id=${participant.participant_id}&preview=1`}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition">
                預覽後測自我效能感量表 →
              </a>
            </div>
          </div>

          <p className="text-center text-xs text-amber-600 mt-6 pb-4">
            ⚠️ 此頁為教師預覽模式，所有資料僅供讀取，任何點擊操作不會修改正式資料庫。
          </p>
        </div>
      </div>
    </div>
  );
}