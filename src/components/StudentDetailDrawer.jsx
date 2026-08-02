import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

export default function StudentDetailDrawer({ student, onClose, preQuizResults, postQuizResults, preScaleResponses, postScaleResponses }) {
  const [preQuestions, setPreQuestions] = useState([]);
  const [postQuestions, setPostQuestions] = useState([]);

  useEffect(() => {
    if (!student) return;
    Promise.all([
      base44.entities.QuestionBank.filter({ survey_type: "pre" }),
      base44.entities.QuestionBank.filter({ survey_type: "post" }),
    ]).then(([pre, post]) => {
      setPreQuestions([...pre].sort((a, b) => a.questionNumber - b.questionNumber));
      setPostQuestions([...post].sort((a, b) => a.questionNumber - b.questionNumber));
    });
  }, [student]);

  if (!student) return null;

  const pid = student.id;

  // --- Quiz answers ---
  const getQuizRecord = (results) => {
    const all = results.filter(r => r.participant === pid);
    return all.find(r => r.is_latest !== false) ?? all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  };
  const preQuizRecord = getQuizRecord(preQuizResults);
  const postQuizRecord = getQuizRecord(postQuizResults);

  // --- Scale scores ---
  const getScaleScore = (responses, part) => {
    const all = responses.filter(r => r.participant === pid && r.part === part);
    const rec = all.find(r => r.is_latest !== false) ?? all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    return rec?.total_score ?? null;
  };

  // --- Trend line data (學習成就) ---
  const trendData = [
    { name: "前測", 學習成就: student.preQuiz ?? null },
    { name: "後測", 學習成就: student.postQuiz ?? null },
  ].filter(d => d["學習成就"] !== null);

  // --- Radar data ---
  // Normalize to 0-100 scale: anxiety max=77, efficacy max=112
  const normalize = (val, max) => val !== null ? parseFloat(((val / max) * 100).toFixed(1)) : null;
  const preAnxN = normalize(student.preAnxiety, 77);
  const postAnxN = normalize(student.postAnxiety, 77);
  const preEffN = normalize(student.preEfficacy, 112);
  const postEffN = normalize(student.postEfficacy, 112);

  const radarData = [
    { subject: "焦慮（前）", 前測: preAnxN, 後測: postAnxN },
    { subject: "焦慮（後）", 前測: preAnxN, 後測: postAnxN },
    { subject: "效能（前）", 前測: preEffN, 後測: postEffN },
    { subject: "效能（後）", 前測: preEffN, 後測: postEffN },
  ];

  // Better radar: 4 axes
  const radarData4 = [
    { subject: "焦慮量表前測", value: preAnxN },
    { subject: "自我效能前測", value: preEffN },
    { subject: "焦慮量表後測", value: postAnxN },
    { subject: "自我效能後測", value: postEffN },
  ].filter(d => d.value !== null);

  // Radar with pre/post series
  const radarSeries = [
    { subject: "焦慮量表", 前測: preAnxN, 後測: postAnxN },
    { subject: "自我效能感", 前測: preEffN, 後測: postEffN },
  ];

  // --- Quiz comparison rows ---
  const buildAnswerRows = (questions, record) => {
    if (!record) return [];
    const answers = record.answers || {};
    return questions.map(q => {
      const selected = answers[q.questionNumber] ?? answers[String(q.questionNumber)] ?? "—";
      const correct = q.correctAnswer;
      const isCorrect = selected !== "—" ? selected === correct : null;
      return { q: q.questionNumber, selected, correct, isCorrect, content: q.questionContent };
    });
  };

  const preRows = buildAnswerRows(preQuestions, preQuizRecord);
  const postRows = buildAnswerRows(postQuestions, postQuizRecord);
  // Pair by question number
  const maxQ = Math.max(preRows.length, postRows.length);
  const pairedRows = Array.from({ length: maxQ }, (_, i) => ({
    pre: preRows[i] || null,
    post: postRows[i] || null,
    qNum: (preRows[i] || postRows[i])?.q,
  }));

  const DeltaBadge = ({ val }) => {
    if (val === null || val === undefined) return <span className="text-gray-400 text-xs">—</span>;
    const color = val > 0 ? "text-green-700 bg-green-100" : val < 0 ? "text-red-700 bg-red-100" : "text-gray-600 bg-gray-100";
    return <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-bold ${color}`}>{val > 0 ? `+${val}` : val}</span>;
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">學生詳細儀表板</p>
            <h2 className="text-lg font-bold text-gray-900">
              {student.participant_id}
              {student.name && <span className="ml-2 text-gray-500 font-normal text-base">{student.name}</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{student.class_id} · {student.group}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Score Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "學習成就", pre: student.preQuiz, post: student.postQuiz, delta: student.deltaQuiz, preC: "text-green-600", postC: "text-emerald-600" },
              { label: "焦慮量表", pre: student.preAnxiety, post: student.postAnxiety, delta: student.deltaAnxiety, preC: "text-blue-600", postC: "text-sky-600" },
              { label: "自我效能感", pre: student.preEfficacy, post: student.postEfficacy, delta: student.deltaEfficacy, preC: "text-purple-600", postC: "text-violet-600" },
            ].map(({ label, pre, post, delta, preC, postC }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-center">
                <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
                <div className="flex justify-around items-center">
                  <div><p className="text-[10px] text-gray-400">前測</p><p className={`text-base font-bold ${preC}`}>{pre ?? "—"}</p></div>
                  <div><p className="text-[10px] text-gray-400">→</p><DeltaBadge val={delta} /></div>
                  <div><p className="text-[10px] text-gray-400">後測</p><p className={`text-base font-bold ${postC}`}>{post ?? "—"}</p></div>
                </div>
              </div>
            ))}
          </div>

          {/* Trend Line Chart */}
          {trendData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">學習成就趨勢</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="學習成就" stroke="#10b981" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Radar Chart */}
          {radarSeries.some(d => d["前測"] !== null || d["後測"] !== null) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">焦慮 & 自我效能感雷達圖（標準化至 100 分）</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarSeries}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="前測" dataKey="前測" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                  <Radar name="後測" dataKey="後測" stroke="#a855f7" fill="#a855f7" fillOpacity={0.25} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Quiz Answer Comparison */}
          {(preRows.length > 0 || postRows.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">答題細節對照</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-2 text-left text-gray-500 font-medium w-10">題</th>
                      <th className="px-2 py-2 text-center text-green-700 font-medium">前測作答</th>
                      <th className="px-2 py-2 text-center text-green-700 font-medium">前測正解</th>
                      <th className="px-2 py-2 text-center text-green-700 font-medium">對？</th>
                      <th className="px-2 py-2 text-center text-emerald-700 font-medium">後測作答</th>
                      <th className="px-2 py-2 text-center text-emerald-700 font-medium">後測正解</th>
                      <th className="px-2 py-2 text-center text-emerald-700 font-medium">對？</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairedRows.map(({ qNum, pre, post }) => {
                      // highlight if changed correctness
                      const changed = pre && post && pre.isCorrect !== post.isCorrect;
                      return (
                        <tr key={qNum} className={`border-b border-gray-100 ${changed ? "bg-yellow-50" : "hover:bg-gray-50"}`}>
                          <td className="px-2 py-1.5 font-medium text-gray-500">{qNum}</td>
                          {/* Pre */}
                          <td className="px-2 py-1.5 text-center font-mono">{pre?.selected ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-gray-500">{pre?.correct ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center">
                            {pre?.isCorrect === null || pre?.isCorrect === undefined ? <span className="text-gray-400">—</span>
                              : pre.isCorrect ? <span className="text-green-600 font-bold">○</span> : <span className="text-red-500 font-bold">✗</span>}
                          </td>
                          {/* Post */}
                          <td className="px-2 py-1.5 text-center font-mono">{post?.selected ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-gray-500">{post?.correct ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center">
                            {post?.isCorrect === null || post?.isCorrect === undefined ? <span className="text-gray-400">—</span>
                              : post.isCorrect ? <span className="text-green-600 font-bold">○</span> : <span className="text-red-500 font-bold">✗</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-yellow-700 mt-2">* 黃底表示前後測作答正確性有變化的題目</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}