import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function PretestUnlockPanel({ sourcePage }) {
  const [participants, setParticipants] = useState([]);
  const [unlockLogs, setUnlockLogs] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResponses, setScaleResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unlocking, setUnlocking] = useState(null); // participant_id being unlocked
  const [confirmTarget, setConfirmTarget] = useState(null); // participant to confirm unlock
  const [filterClass, setFilterClass] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set()); // selected participant db ids
  const [batchUnlocking, setBatchUnlocking] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, logs, qr, sr] = await Promise.all([
      base44.entities.Participant.list(),
      base44.entities.PretestUnlockLog.list("-unlocked_at"),
      base44.entities.QuizResult.filter({ survey_type: "pre" }),
      base44.entities.ScaleResponse.filter({ survey_type: "pre" }),
    ]);
    setParticipants(p);
    setUnlockLogs(logs);
    setQuizResults(qr);
    setScaleResponses(sr);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getPreStatus = (participant) => {
    const quiz = quizResults.filter(r => r.participant === participant.id);
    const anxiety = scaleResponses.filter(r => r.participant === participant.id && r.part === "anxiety");
    const efficacy = scaleResponses.filter(r => r.participant === participant.id && r.part === "efficacy");
    const latestQuiz = quiz.sort((a, b) => (b.version_no || 1) - (a.version_no || 1))[0];
    const latestAnxiety = anxiety.sort((a, b) => (b.version_no || 1) - (a.version_no || 1))[0];
    const latestEfficacy = efficacy.sort((a, b) => (b.version_no || 1) - (a.version_no || 1))[0];
    const maxVersion = Math.max(
      latestQuiz?.version_no || 0,
      latestAnxiety?.version_no || 0,
      latestEfficacy?.version_no || 0
    );
    return {
      hasQuiz: quiz.length > 0,
      hasAnxiety: anxiety.length > 0,
      hasEfficacy: efficacy.length > 0,
      isDone: quiz.length > 0 && anxiety.length > 0 && efficacy.length > 0,
      totalVersions: maxVersion,
      totalAttempts: Math.max(quiz.length, anxiety.length, efficacy.length),
    };
  };

  const getActiveUnlock = (participant) => {
    return unlockLogs.find(l => l.participant_db_id === participant.id && l.is_active);
  };

  const handleUnlock = async (participant) => {
    setUnlocking(participant.participant_id);
    const user = await base44.auth.me();
    await base44.entities.PretestUnlockLog.create({
      participant_id: participant.participant_id,
      participant_db_id: participant.id,
      unlocked_by: user?.email || "admin",
      unlocked_at: new Date().toISOString(),
      unlock_type: "pretest",
      source_page: sourcePage,
      is_active: true,
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
      await base44.entities.PretestUnlockLog.create({
        participant_id: p.participant_id,
        participant_db_id: p.id,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
        unlock_type: "pretest",
        source_page: sourcePage,
        is_active: true,
      });
    }
    setSelectedIds(new Set());
    setBatchConfirmOpen(false);
    setBatchUnlocking(false);
    await load();
  };

  // Returns participants eligible for batch selection:
  // completed pretest + no active unlock
  const getBatchEligible = (classId) => {
    return participants.filter(p => {
      if (classId !== "all" && p.class_id !== classId) return false;
      const status = getPreStatus(p);
      if (!status.isDone) return false;
      if (getActiveUnlock(p)) return false;
      return true;
    });
  };

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

  const handleRevokeUnlock = async (participant) => {
    const activeLog = getActiveUnlock(participant);
    if (!activeLog) return;
    await base44.entities.PretestUnlockLog.update(activeLog.id, { is_active: false });
    await load();
  };

  const classes = [...new Set(participants.map(p => p.class_id).filter(Boolean))].sort();

  const filtered = participants
    .filter(p => filterClass === "all" || p.class_id === filterClass)
    .filter(p => {
      if (!search.trim()) return true;
      const t = search.toLowerCase();
      return (p.participant_id || "").toLowerCase().includes(t) ||
        (p.name || "").toLowerCase().includes(t) ||
        (p.student_id || "").toLowerCase().includes(t);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 說明區塊 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">📋 前測解鎖說明</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-700">
          <li>解鎖後，學生可重新進行前測（三部分：知識測驗、焦慮量表、自我效能量表）</li>
          <li>原始前測資料完整保留，不會被覆蓋</li>
          <li>重做後的新資料以新版本儲存，可回溯歷史</li>
        </ul>
      </div>

      {/* 解鎖紀錄摘要 */}
      {unlockLogs.filter(l => l.is_active).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ⚠️ 目前有 <strong>{unlockLogs.filter(l => l.is_active).length}</strong> 位學生前測已解鎖，尚未重做
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
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-teal-700">⚡ 批次解鎖</span>
        <button
          onClick={selectAllEligibleInClass}
          className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition"
        >
          {filterClass === "all" ? "全選所有可解鎖" : `全選「${filterClass}」可解鎖`}
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
            className="px-3 py-1.5 bg-white text-teal-700 border border-teal-300 rounded-lg text-xs font-medium hover:bg-teal-50 transition"
          >
            + 加選「{c}」
          </button>
        ))}
        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-teal-800 font-semibold ml-auto">已選 {selectedIds.size} 人</span>
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
        )}
        {selectedIds.size === 0 && (
          <span className="text-xs text-teal-600 ml-auto">選取已完成前測且未解鎖的學生後可批次解鎖</span>
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
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">前測狀態</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">版本 / 歷史</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">解鎖狀態</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const status = getPreStatus(p);
              const activeUnlock = getActiveUnlock(p);
              const logs = unlockLogs.filter(l => l.participant_db_id === p.id);

              const isEligibleForBatch = status.isDone && !activeUnlock;
              return (
                <tr key={p.id} className={`border-b border-gray-100 hover:bg-gray-50 transition ${selectedIds.has(p.id) ? "bg-teal-50" : ""}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => isEligibleForBatch && toggleSelect(p.id)}
                      disabled={!isEligibleForBatch}
                      className="w-4 h-4 accent-teal-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                      title={!isEligibleForBatch ? (activeUnlock ? "已解鎖" : "前測未完成") : ""}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-800">{p.participant_id}</p>
                    <p className="text-gray-400">{p.name || "—"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.class_id || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {[
                        { label: "P1", done: status.hasQuiz },
                        { label: "P2", done: status.hasAnxiety },
                        { label: "P3", done: status.hasEfficacy },
                      ].map(({ label, done }) => (
                        <span key={label} className={`px-1.5 py-0.5 rounded font-bold border ${
                          done ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-100 text-gray-400 border-gray-200"
                        }`}>{label}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {status.totalVersions > 1 ? (
                      <span className="text-amber-600 font-semibold">v{status.totalVersions}（共 {status.totalAttempts} 次）</span>
                    ) : status.totalVersions === 1 ? (
                      <span className="text-gray-500">v1（首次）</span>
                    ) : (
                      <span className="text-gray-400">未作答</span>
                    )}
                    {logs.length > 0 && (
                      <p className="text-gray-400 mt-0.5">解鎖 {logs.length} 次</p>
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
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
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
                        disabled={!status.isDone}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                          status.isDone
                            ? "bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100"
                            : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                        }`}
                        title={!status.isDone ? "學生尚未完成首次前測" : ""}
                      >
                        🔓 前測解鎖
                      </button>
                    )}
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

      {/* 批次解鎖確認 Modal */}
      {batchConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">確認批次前測解鎖</h3>
            <p className="text-sm text-gray-600 mb-3">
              此操作將同時解鎖以下 <strong>{selectedIds.size}</strong> 位學生的前測：
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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              ⚠️ 原始前測資料完整保留，新作答將以新版本儲存。
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBatchUnlock}
                disabled={batchUnlocking}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition"
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

      {/* 確認 Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">確認前測解鎖</h3>
            <p className="text-sm text-gray-600 mb-4">
              此操作將允許 <strong>{confirmTarget.participant_id}（{confirmTarget.name}）</strong> 重新作答前測。
              系統會保留原始前測資料，新的作答結果將以新版本儲存，不會覆蓋舊紀錄。
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              ⚠️ 原始前測（第 1 版）資料將完整保留，可作為研究 baseline 使用。
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleUnlock(confirmTarget)}
                disabled={unlocking === confirmTarget.participant_id}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition"
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