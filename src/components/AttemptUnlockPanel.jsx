import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function AttemptUnlockPanel({ assignments }) {
  const [participants, setParticipants] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParticipant, setSearchParticipant] = useState("");
  const [filterAssignment, setFilterAssignment] = useState("all");
  const [saving, setSaving] = useState(null); // attempt id being saved
  const [log, setLog] = useState([]); // local operation log

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [p, a] = await Promise.all([
        base44.entities.Participant.list(),
        base44.entities.Attempt.filter({})
      ]);
      setParticipants(p);
      // Only show rated attempts
      setAttempts(a.filter(att => att.teacher_rating));
      setLoading(false);
    };
    load();
  }, []);

  const getParticipant = (id) => participants.find(p => p.id === id);
  const getAssignment = (id) => assignments.find(a => a.id === id);

  const handleToggleOverride = async (attempt) => {
    setSaving(attempt.id);
    const newVal = !attempt.allow_redo_override;
    const user = await base44.auth.me();
    const updateData = {
      allow_redo_override: newVal,
    };
    if (newVal) {
      updateData.redo_unlocked_at = new Date().toISOString();
      updateData.redo_unlocked_by = user?.email || "admin";
    } else {
      updateData.redo_unlocked_at = null;
      updateData.redo_unlocked_by = null;
    }
    await base44.entities.Attempt.update(attempt.id, updateData);
    setAttempts(prev => prev.map(a => a.id === attempt.id ? { ...a, ...updateData } : a));
    const p = getParticipant(attempt.participant);
    const asgn = getAssignment(attempt.assignment);
    setLog(prev => [{
      time: new Date().toLocaleString("zh-TW"),
      participant: p?.name || p?.participant_id || attempt.participant,
      assignment: asgn?.assignment_id || attempt.assignment,
      action: newVal ? "✅ 解鎖重做" : "🔒 重新鎖定",
      by: user?.email || "admin",
    }, ...prev].slice(0, 50));
    setSaving(null);
  };

  const filtered = attempts.filter(att => {
    const p = getParticipant(att.participant);
    const matchP = !searchParticipant || 
      (p?.name || "").includes(searchParticipant) || 
      (p?.participant_id || "").includes(searchParticipant);
    const matchA = filterAssignment === "all" || att.assignment === filterAssignment;
    return matchP && matchA;
  });

  const ratedAssignments = [...new Map(attempts.map(a => [a.assignment, a])).values()].map(a => getAssignment(a.assignment)).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="搜尋學生姓名或 ID…"
          value={searchParticipant}
          onChange={e => setSearchParticipant(e.target.value)}
          className="flex-1 min-w-40 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <select
          value={filterAssignment}
          onChange={e => setFilterAssignment(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">所有任務</option>
          {ratedAssignments.map(a => (
            <option key={a.id} value={a.id}>{a.assignment_id} {a.title ? `· ${a.title}` : ""}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">共 {filtered.length} 筆已評分 attempt</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">無符合條件的已評分任務</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">學生</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">任務</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">等第</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">重做次數</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">解鎖狀態</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(att => {
                const p = getParticipant(att.participant);
                const asgn = getAssignment(att.assignment);
                const isUnlocked = !!att.allow_redo_override;
                return (
                  <tr key={att.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p?.name || "—"}</p>
                      <p className="text-xs text-gray-400">{p?.participant_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{asgn?.assignment_id || att.assignment?.slice(0,8)}</p>
                      <p className="text-xs text-gray-400">{asgn?.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold px-2 py-0.5 rounded border ${
                        att.teacher_rating === '優' ? 'bg-green-100 text-green-700 border-green-300' :
                        att.teacher_rating === '甲' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                        att.teacher_rating === '乙' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                        att.teacher_rating === '丙' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                        'bg-red-100 text-red-700 border-red-300'
                      }`}>{att.teacher_rating}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{att.redo_count || 0} 次</td>
                    <td className="px-4 py-3">
                      {isUnlocked ? (
                        <div>
                          <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">↻ 已解鎖</span>
                          {att.redo_unlocked_at && (
                            <p className="text-xs text-gray-400 mt-0.5">{new Date(att.redo_unlocked_at).toLocaleString("zh-TW")}</p>
                          )}
                          {att.redo_unlocked_by && (
                            <p className="text-xs text-gray-400">{att.redo_unlocked_by}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">🔒 鎖定中</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleOverride(att)}
                        disabled={saving === att.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
                          isUnlocked
                            ? "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300"
                            : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}
                      >
                        {saving === att.id ? "處理中…" : isUnlocked ? "重新鎖定" : "允許重做"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Operation log */}
      {log.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">操作紀錄（本次工作階段）</p>
          <div className="space-y-1.5">
            {log.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-400 font-mono">{entry.time}</span>
                <span>{entry.action}</span>
                <span className="font-medium">{entry.participant}</span>
                <span className="text-gray-400">·</span>
                <span>{entry.assignment}</span>
                <span className="text-gray-400 ml-auto">by {entry.by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}