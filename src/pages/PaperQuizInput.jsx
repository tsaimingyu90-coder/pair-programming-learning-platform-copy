import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

const OPTION_KEYS = ["A", "B", "C", "D"];

function PaperQuizInputInner() {
  const [participants, setParticipants] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [postQuizResults, setPostQuizResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterClass, setFilterClass] = useState("all");
  const [searchText, setSearchText] = useState("");

  // answers: { [participantId]: { [qNum]: "A"|"B"|"C"|"D" } }
  const [answers, setAnswers] = useState({});
  // loadedIds: participants whose answers were pre-filled from DB (not "pending")
  const [loadedIds, setLoadedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());

  // Active cell: { participantIdx, qIdx }
  const [activeCell, setActiveCell] = useState(null);
  const tableRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      const ps = await base44.entities.Participant.list('-created_date', 300);
      const qs = await base44.entities.QuestionBank.filter({ survey_type: "post" });
      const qrs = await base44.entities.QuizResult.filter({ survey_type: "post" });

      setParticipants(ps || []);
      setQuestions((qs || []).sort((a, b) => a.questionNumber - b.questionNumber));
      setPostQuizResults(qrs || []);
      // Pre-fill answers from existing latest results
      const prefilledAnswers = {};
      (qrs || []).forEach(r => {
        if (r.is_latest !== false && r.answers && r.participant) {
          prefilledAnswers[r.participant] = { ...r.answers };
        }
      });
      setAnswers(prefilledAnswers);
      setLoadedIds(new Set(Object.keys(prefilledAnswers)));
      setLoading(false);
    };
    loadData();
  }, []);

  const classes = [...new Set(participants.map(p => p.class_id).filter(Boolean))].sort();

  const filtered = participants
    .filter(p => filterClass === "all" || p.class_id === filterClass)
    .filter(p => {
      if (!searchText.trim()) return true;
      const t = searchText.toLowerCase();
      return (p.name || "").toLowerCase().includes(t) ||
        (p.participant_id || "").toLowerCase().includes(t) ||
        (p.student_id || "").toLowerCase().includes(t);
    })
    .sort((a, b) => (a.participant_id || "").localeCompare(b.participant_id || ""));

  const getExistingResult = (participantId) =>
    postQuizResults.find(r => r.participant === participantId && r.is_latest !== false);

  // Calculate score from answers for one participant
  const calcScore = (participantId) => {
    const pAnswers = answers[participantId] || {};
    let correct = 0;
    questions.forEach(q => {
      if (pAnswers[q.questionNumber] === q.correctAnswer) correct++;
    });
    return questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
  };

  const getCorrectCount = (participantId) => {
    const pAnswers = answers[participantId] || {};
    return questions.filter(q => pAnswers[q.questionNumber] === q.correctAnswer).length;
  };

  const getAnsweredCount = (participantId) => {
    const pAnswers = answers[participantId] || {};
    return questions.filter(q => pAnswers[q.questionNumber]).length;
  };

  // Set a single answer
  const setAnswer = useCallback((participantId, qNum, option) => {
    setAnswers(prev => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] || {}),
        [qNum]: option,
      }
    }));
    // Mark as modified (no longer a clean DB load)
    setLoadedIds(prev => { const s = new Set(prev); s.delete(participantId); return s; });
  }, []);

  // Keyboard navigation: A/B/C/D sets answer and moves right; ArrowKeys navigate
  const handleKeyDown = useCallback((e, participantIdx, qIdx) => {
    const key = e.key.toUpperCase();
    if (OPTION_KEYS.includes(key)) {
      e.preventDefault();
      const p = filtered[participantIdx];
      const q = questions[qIdx];
      if (!p || !q) return;
      setAnswer(p.id, q.questionNumber, key);
      // Move to next question
      const nextQIdx = qIdx + 1;
      if (nextQIdx < questions.length) {
        setActiveCell({ participantIdx, qIdx: nextQIdx });
      } else {
        // Move to next participant
        const nextPIdx = participantIdx + 1;
        if (nextPIdx < filtered.length) {
          setActiveCell({ participantIdx: nextPIdx, qIdx: 0 });
        }
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setActiveCell({ participantIdx, qIdx: Math.min(qIdx + 1, questions.length - 1) });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveCell({ participantIdx, qIdx: Math.max(qIdx - 1, 0) });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveCell({ participantIdx: Math.min(participantIdx + 1, filtered.length - 1), qIdx });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveCell({ participantIdx: Math.max(participantIdx - 1, 0), qIdx });
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const p = filtered[participantIdx];
      const q = questions[qIdx];
      if (p && q) setAnswer(p.id, q.questionNumber, null);
    }
  }, [filtered, questions, setAnswer]);

  // Focus management
  useEffect(() => {
    if (!activeCell) return;
    const el = tableRef.current?.querySelector(
      `[data-cell="${activeCell.participantIdx}-${activeCell.qIdx}"]`
    );
    el?.focus();
  }, [activeCell]);

  const pendingParticipants = filtered.filter(p => getAnsweredCount(p.id) > 0 && !savedIds.has(p.id) && !loadedIds.has(p.id));

  const handleSaveAll = async () => {
    const toSave = pendingParticipants;
    if (toSave.length === 0) return;
    if (!confirm(`確認儲存 ${toSave.length} 位學生的後測P1成績？`)) return;
    setSaving(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    const newSaved = new Set(savedIds);

    for (const p of toSave) {
      const score = calcScore(p.id);
      const pAnswers = answers[p.id] || {};
      const answersMap = {};
      questions.forEach(q => { if (pAnswers[q.questionNumber]) answersMap[q.questionNumber] = pAnswers[q.questionNumber]; });

      const existing = postQuizResults.filter(r => r.participant === p.id);
      for (const old of existing) {
        if (old.is_latest !== false) {
          await base44.entities.QuizResult.update(old.id, { is_latest: false });
        }
      }
      const versionNo = existing.length + 1;
      await base44.entities.QuizResult.create({
        participant: p.id,
        survey_type: "post",
        score,
        answers: answersMap,
        timestamp: now,
        version_no: versionNo,
        is_original: versionNo === 1,
        is_latest: true,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
      });
      newSaved.add(p.id);
    }

    // Refresh postQuizResults
    const updated = await base44.entities.QuizResult.filter({ survey_type: "post" });
    setPostQuizResults(updated || []);
    setSavedIds(newSaved);
    setSaving(false);
    alert(`✅ 已儲存 ${toSave.length} 位學生成績`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <a href="/TeacherDashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">← 返回教師看板</a>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          <p className="text-lg font-semibold mb-2">尚無後測題目</p>
          <p className="text-sm">請先在題庫管理中新增後測（survey_type=post）的題目</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="mb-4">
          <a href="/TeacherDashboard" className="text-sm text-gray-500 hover:text-gray-700 inline-block mb-2">← 返回教師看板</a>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📝 後測P1 紙本成績輸入</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                共 {questions.length} 題 · 點擊格子後按 <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">A</kbd>/<kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">B</kbd>/<kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">C</kbd>/<kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">D</kbd> 快速輸入 · 方向鍵移動格子 · 自動計算分數
              </p>
            </div>
            <button
              onClick={handleSaveAll}
              disabled={saving || pendingParticipants.length === 0}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition flex-shrink-0"
            >
              {saving ? "儲存中…" : `💾 儲存全部（${pendingParticipants.length} 人）`}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex gap-6 flex-wrap text-xs text-gray-600">
          <span>🟦 已選答案</span>
          <span>🟩 答對</span>
          <span>🟥 答錯</span>
          <span>⬜ 未填</span>
          <span className="ml-auto text-gray-400">正確答案在 hover 時顯示</span>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <input
            type="text"
            placeholder="搜尋姓名、ID、學號..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部班級</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-sm text-gray-400">共 {filtered.length} 人</span>
          {pendingParticipants.length > 0 && (
            <span className="text-sm text-amber-600 font-medium">⚠ {pendingParticipants.length} 人待儲存</span>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto" ref={tableRef}>
          <table className="text-xs border-separate border-spacing-0 min-w-max w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20 border-b border-r border-gray-200">ID</th>
                <th className="sticky left-20 z-20 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16 border-b border-r border-gray-200">班級</th>
                <th className="sticky left-36 z-20 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16 border-b border-r border-gray-200">姓名</th>
                {questions.map(q => (
                  <th
                    key={q.id}
                    className="px-1 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-8 border-b border-gray-200"
                    title={`Q${q.questionNumber}: ${q.questionContent || ""}\n正確答案: ${q.correctAnswer}`}
                  >
                    <div>Q{q.questionNumber}</div>
                    <div className="text-gray-300 font-normal">{q.correctAnswer}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-b border-l border-gray-200 w-20">答對題數</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 w-16">分數</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 w-20">原有分數</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 w-16">狀態</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, pIdx) => {
                const pAnswers = answers[p.id] || {};
                const answeredCount = getAnsweredCount(p.id);
                const correctCount = getCorrectCount(p.id);
                const score = answeredCount > 0 ? calcScore(p.id) : null;
                const existing = getExistingResult(p.id);
                const isSaved = savedIds.has(p.id);

                return (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/20">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-mono text-blue-600 whitespace-nowrap w-20 border-r border-gray-100">
                      {p.participant_id}
                    </td>
                    <td className="sticky left-20 z-10 bg-white px-3 py-1.5 text-gray-600 whitespace-nowrap w-16 border-r border-gray-100">{p.class_id || "—"}</td>
                    <td className="sticky left-36 z-10 bg-white px-3 py-1.5 text-gray-700 whitespace-nowrap w-16 border-r border-gray-100">{p.name || "—"}</td>

                    {questions.map((q, qIdx) => {
                      const selected = pAnswers[q.questionNumber];
                      const isActive = activeCell?.participantIdx === pIdx && activeCell?.qIdx === qIdx;
                      const isCorrect = selected && selected === q.correctAnswer;
                      const isWrong = selected && selected !== q.correctAnswer;

                      let cellClass = "border border-gray-100 cursor-pointer select-none transition outline-none ";
                      if (isActive) {
                        cellClass += "ring-2 ring-inset ring-blue-500 bg-blue-50 ";
                      } else if (isCorrect) {
                        cellClass += "bg-green-50 ";
                      } else if (isWrong) {
                        cellClass += "bg-red-50 ";
                      } else if (selected) {
                        cellClass += "bg-blue-50 ";
                      }

                      return (
                        <td
                          key={q.id}
                          data-cell={`${pIdx}-${qIdx}`}
                          tabIndex={0}
                          className={cellClass + "w-8 px-0 py-1 text-center"}
                          title={`Q${q.questionNumber} 正確答案: ${q.correctAnswer}`}
                          onClick={() => setActiveCell({ participantIdx: pIdx, qIdx })}
                          onFocus={() => setActiveCell({ participantIdx: pIdx, qIdx })}
                          onKeyDown={e => handleKeyDown(e, pIdx, qIdx)}
                        >
                          {selected ? (
                            <span className={`font-bold text-xs ${isCorrect ? "text-green-700" : isWrong ? "text-red-600" : "text-blue-700"}`}>
                              {selected}
                            </span>
                          ) : (
                            <span className="text-gray-200">·</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-3 py-1.5 text-center border-l border-gray-100">
                      {answeredCount > 0 ? (
                        <span className={`font-semibold ${correctCount === questions.length ? "text-green-600" : correctCount >= questions.length * 0.6 ? "text-blue-600" : "text-red-500"}`}>
                          {correctCount}/{questions.length}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {score !== null ? (
                        <span className={`font-bold ${score >= 60 ? "text-green-700" : "text-red-600"}`}>{score}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {existing ? (
                        <span className="text-blue-600 font-medium">{existing.score}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {isSaved ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">✅ 已儲存</span>
                      ) : loadedIds.has(p.id) ? (
                        <span className="text-xs text-gray-400">已有資料</span>
                      ) : answeredCount > 0 ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">待儲存</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-10">沒有符合條件的學生</p>
          )}
        </div>

        {/* Bottom save bar */}
        {pendingParticipants.length > 0 && (
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm shadow-xl hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {saving ? "儲存中…" : `💾 儲存 ${pendingParticipants.length} 人成績`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaperQuizInput() {
  return (
    <TeacherAuthGuard>
      <PaperQuizInputInner />
    </TeacherAuthGuard>
  );
}