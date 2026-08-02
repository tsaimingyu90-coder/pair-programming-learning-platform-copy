import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

export default function PosttestUnlockPanel({ sourcePage }) {
  const [participants, setParticipants] = useState([]);
  const [unlockLogs, setUnlockLogs] = useState([]);
  const [postQuizResults, setPostQuizResults] = useState([]);
  const [postScaleResponses, setPostScaleResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchUnlocking, setBatchUnlocking] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null); // participant to show history

  const load = async () => {
    setLoading(true);
    const [p, logs, postQr, postSr] = await Promise.all([
      base44.entities.Participant.list(),
      base44.entities.PosttestUnlockLog.list("-unlocked_at"),
      base44.entities.QuizResult.filter({ survey_type: "post" }),
      base44.entities.ScaleResponse.filter({ survey_type: "post" }),
    ]);
    setParticipants(p);
    setUnlockLogs(logs);
    setPostQuizResults(postQr);
    setPostScaleResponses(postSr);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getPostStatus = (participant) => {
    const quiz = postQuizResults.filter(r => r.participant === participant.id);
    const anxiety = postScaleResponses.filter(r => r.participant === participant.id && r.part === "anxiety");
    const efficacy = postScaleResponses.filter(r => r.participant === participant.id && r.part === "efficacy");
    const collab = postScaleResponses.filter(r => r.participant === participant.id && r.part === "collaboration");
    return {
      hasQuiz: quiz.length > 0,
      hasAnxiety: anxiety.length > 0,
      hasEfficacy: efficacy.length > 0,
      hasCollab: collab.length > 0,
      isDone: quiz.length > 0 && anxiety.length > 0 && efficacy.length > 0 && collab.length > 0,
    };
  };

  const getActiveUnlock = (participant) =>
    unlockLogs.find(l => l.participant_db_id === participant.id && l.is_active);

  const handleUnlock = async (participant) => {
    setUnlocking(participant.participant_id);
    const user = await base44.auth.me();
    await base44.entities.PosttestUnlockLog.create({
      participant_id: participant.participant_id,
      participant_db_id: participant.id,
      unlocked_by: user?.email || "admin",
      unlocked_at: new Date().toISOString(),
      source_page: sourcePage || "AssignmentManager",
      is_active: true,
    });
    setConfirmTarget(null);
    setUnlocking(null);
    await load();
  };

  const handleRevokeUnlock = async (participant) => {
    const activeLog = getActiveUnlock(participant);
    if (!activeLog) return;
    await base44.entities.PosttestUnlockLog.update(activeLog.id, { is_active: false });
    await load();
  };

  // Allow redo: unlock again even if already completed (creates new unlock log)
  const handleUnlockRedo = async (participant) => {
    setUnlocking(participant.participant_id);
    const user = await base44.auth.me();
    // Mark all previous quiz/scale results as not latest
    const pQr = postQuizResults.filter(r => r.participant === participant.id && r.is_latest);
    const pSr = postScaleResponses.filter(r => r.participant === participant.id && r.is_latest);
    await Promise.all([
      ...pQr.map(r => base44.entities.QuizResult.update(r.id, { is_latest: false })),
      ...pSr.map(r => base44.entities.ScaleResponse.update(r.id, { is_latest: false })),
    ]);
    await base44.entities.PosttestUnlockLog.create({
      participant_id: participant.participant_id,
      participant_db_id: participant.id,
      unlocked_by: user?.email || "admin",
      unlocked_at: new Date().toISOString(),
      source_page: sourcePage || "AssignmentManager",
      is_active: true,
      reason: "redo",
    });
    setConfirmTarget(null);
    setUnlocking(null);
    await load();
  };

  const handleBatchUnlock = async () => {
    setBatchUnlocking(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    const targets = participants.filter(p => selectedIds.has(p.id));
    for (const p of targets) {
      await base44.entities.PosttestUnlockLog.create({
        participant_id: p.participant_id,
        participant_db_id: p.id,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
        source_page: sourcePage || "AssignmentManager",
        is_active: true,
      });
    }
    setSelectedIds(new Set());
    setBatchConfirmOpen(false);
    setBatchUnlocking(false);
    await load();
  };

  const getBatchEligible = (classId) =>
    participants.filter(p => {
      if (classId !== "all" && p.class_id !== classId) return false;
      return !getActiveUnlock(p);
    });

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllEligibleInClass = () => {
    const eligible = getBatchEligible(filterClass);
    setSelectedIds(new Set(eligible.map(p => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const classes = [...new Set(participants.map(p => p.class_id).filter(Boolean))].sort();

  const filtered = participants
    .filter(p => filterClass === "all" || p.class_id === filterClass)
    .filter(p => {
      if (!search.trim()) return true;
      const t = search.toLowerCase();
      return (p.participant_id || "").toLowerCase().includes(t) ||
        (p.name || "").toLowerCase().includes(t) ||
        (p.student_id || "").toLowerCase().includes(t);
    })
    .sort((a, b) => (a.participant_id || "").localeCompare(b.participant_id || ""));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activeCount = unlockLogs.filter(l => l.is_active).length;

  return (
    <div className="space-y-4">
      {/* 說明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">📋 後測解鎖說明</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-700">
          <li>後測預設上鎖，學生在任務選單中只能看到後測區塊，但無法點擊進入作答</li>
          <li>老師解鎖後，學生才能進行後測（四部分：知識測驗、焦慮量表、自我效能感、協作學習知覺）</li>
          <li>可隨時撤銷解鎖（若學生尚未作答）</li>
        </ul>
      </div>

      {/* 活躍解鎖摘要 */}
      {activeCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ⚠️ 目前有 <strong>{activeCount}</strong> 位學生後測已解鎖，尚未全部完成
        </div>
      )}

      {/* 篩選 */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterClass}
          onChange={e => { setFilterClass(e.target.value); setSelectedIds(new Set()); }}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">所有班級</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜尋姓名、學號、參與者 ID…"
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* 批次工具列 */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-indigo-700">⚡ 批次解鎖</span>
        <button
          onClick={selectAllEligibleInClass}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
        >
          {filterClass === "all" ? "全選所有未解鎖" : `全選「${filterClass}」未解鎖`}
        </button>
        {classes.filter(c => c !== filterClass).map(c => (
          <button
            key={c}
            onClick={() => {
              const eligible = getBatchEligible(c);
              setSelectedIds(prev => {
                const next = new Set(prev);
                eligible.forEach(p => next.add(p.id));
                return next;
              });
            }}
            className="px-3 py-1.5 bg-white text-indigo-700 border border-indigo-300 rounded-lg text-xs font-medium hover:bg-indigo-50 transition"
          >
            + 加選「{c}」
          </button>
        ))}
        {selectedIds.size > 0 ? (
          <>
            <span className="text-xs text-indigo-800 font-semibold ml-auto">已選 {selectedIds.size} 人</span>
            <button
              onClick={() => setBatchConfirmOpen(true)}
              className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 transition"
            >
              🔓 批次解鎖（{selectedIds.size}）
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
            >
              清除選取
            </button>
          </>
        ) : (
          <span className="text-xs text-indigo-600 ml-auto">選取學生後可批次解鎖後測</span>
        )}
      </div>

      {/* 學生列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 w-8"></th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">參與者</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">班級</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">後測完成狀態</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">解鎖狀態</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">版本 / 歷史</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const status = getPostStatus(p);
              const activeUnlock = getActiveUnlock(p);
              const logs = unlockLogs.filter(l => l.participant_db_id === p.id);
              const isEligible = !activeUnlock;

              return (
                <tr key={p.id} className={`border-b border-gray-100 hover:bg-gray-50 transition ${selectedIds.has(p.id) ? "bg-indigo-50" : ""}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => isEligible && toggleSelect(p.id)}
                      disabled={!isEligible}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                      title={!isEligible ? "已解鎖" : ""}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-800">{p.participant_id}</p>
                    <p className="text-gray-400">{p.name || "—"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.class_id || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { label: "後P1", done: status.hasQuiz },
                        { label: "後P2", done: status.hasAnxiety },
                        { label: "後P3", done: status.hasEfficacy },
                        { label: "後P4", done: status.hasCollab },
                      ].map(({ label, done }) => (
                        <span key={label} className={`px-1.5 py-0.5 rounded font-bold border text-[10px] ${
                          done ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-100 text-gray-400 border-gray-200"
                        }`}>{label}</span>
                      ))}
                    </div>
                    {status.isDone && (
                      <p className="text-green-600 font-semibold mt-0.5">✓ 全部完成</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {activeUnlock ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-full font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"></span>
                          已解鎖
                        </span>
                        <p className="text-gray-400 mt-0.5">by {activeUnlock.unlocked_by?.split("@")[0]}</p>
                        {logs.length > 1 && <p className="text-gray-400">共解鎖 {logs.length} 次</p>}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">🔒 已上鎖</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-gray-700 font-medium">v{logs.length}</span>
                      <button
                        onClick={() => setHistoryTarget(historyTarget?.id === p.id ? null : p)}
                        className="text-[10px] text-indigo-600 hover:underline text-left"
                      >
                        {logs.length > 0 ? `查看 ${logs.length} 筆記錄` : "無記錄"}
                      </button>
                      {historyTarget?.id === p.id && (
                        <div className="mt-1 space-y-1 max-h-32 overflow-y-auto pr-1">
                          {logs.sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at)).map((l, i) => (
                            <div key={l.id} className="text-[10px] bg-gray-50 border border-gray-200 rounded p-1.5">
                              <span className="font-bold text-gray-500">#{logs.length - i}</span>
                              <span className={`ml-1 px-1 rounded ${l.is_active ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>
                                {l.is_active ? "有效" : "已失效"}
                              </span>
                              {l.reason === "redo" && <span className="ml-1 px-1 bg-purple-100 text-purple-600 rounded">重做</span>}
                              <div className="text-gray-400 mt-0.5">{l.unlocked_by?.split("@")[0]} · {l.unlocked_at ? format(new Date(l.unlocked_at), "MM/dd HH:mm") : "—"}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      {activeUnlock ? (
                        <button
                          onClick={() => handleRevokeUnlock(p)}
                          className="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
                        >
                          撤銷解鎖
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmTarget(p)}
                          className="px-3 py-1 rounded-lg text-xs font-medium border transition bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100"
                        >
                          🔓 解鎖後測
                        </button>
                      )}
                      {status.hasAnxiety && status.hasEfficacy && !activeUnlock && (
                        <button
                          onClick={() => handleUnlockRedo(p)}
                          disabled={unlocking === p.participant_id}
                          className="px-3 py-1 rounded-lg text-xs font-medium border transition bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 disabled:opacity-50"
                        >
                          {unlocking === p.participant_id ? "處理中…" : "🔄 允許重做"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-8">沒有符合的參與者</div>
        )}
      </div>

      {/* 批次確認 Modal */}
      {batchConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">確認批次後測解鎖</h3>
            <p className="text-sm text-gray-600 mb-3">
              此操作將同時解鎖以下 <strong>{selectedIds.size}</strong> 位學生的後測：
            </p>
            <div className="max-h-40 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-2 mb-4 space-y-1">
              {participants.filter(p => selectedIds.has(p.id)).map(p => (
                <div key={p.id} className="text-xs text-gray-700 flex items-center gap-2">
                  <span className="font-semibold w-20 flex-shrink-0">{p.participant_id}</span>
                  <span className="text-gray-400">{p.name}</span>
                  <span className="text-gray-300">{p.class_id}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-4">
              解鎖後學生即可在任務選單中點擊後測各部分進行作答。
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBatchUnlock}
                disabled={batchUnlocking}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {batchUnlocking ? "解鎖中…" : `確認解鎖 ${selectedIds.size} 人`}
              </button>
              <button
                onClick={() => setBatchConfirmOpen(false)}
                disabled={batchUnlocking}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 單人確認 Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">確認後測解鎖</h3>
            <p className="text-sm text-gray-600 mb-4">
              此操作將允許 <strong>{confirmTarget.participant_id}（{confirmTarget.name}）</strong> 進行後測作答。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleUnlock(confirmTarget)}
                disabled={unlocking === confirmTarget.participant_id}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {unlocking === confirmTarget.participant_id ? "處理中…" : "確認解鎖"}
              </button>
              <button
                onClick={() => setConfirmTarget(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}