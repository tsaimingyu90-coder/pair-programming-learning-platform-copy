import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const TOTAL_QUESTIONS = 20; // 後測P1題數，每題5分，滿分100

export default function PaperQuizInputModal({ participants, postQuizResults, onClose, onSaved }) {
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({});
  const [filterClass, setFilterClass] = useState("all");
  const [searchText, setSearchText] = useState("");

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

  const getExistingScore = (participantId) => {
    const r = postQuizResults.find(r => r.participant === participantId && r.is_latest !== false);
    return r?.score ?? null;
  };

  const handleSave = async () => {
    const entries = Object.entries(scores).filter(([, v]) => v !== "" && v !== null && v !== undefined);
    if (entries.length === 0) return;
    setSaving(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    const newSaved = {};

    for (const [participantId, scoreStr] of entries) {
      const score = Number(scoreStr);
      if (isNaN(score) || score < 0 || score > 100) continue;

      // 先把舊的 is_latest 設為 false
      const existing = postQuizResults.filter(r => r.participant === participantId);
      for (const old of existing) {
        if (old.is_latest !== false) {
          await base44.entities.QuizResult.update(old.id, { is_latest: false });
        }
      }

      const versionNo = existing.length + 1;
      await base44.entities.QuizResult.create({
        participant: participantId,
        survey_type: "post",
        score,
        answers: {},
        timestamp: now,
        version_no: versionNo,
        is_original: versionNo === 1,
        is_latest: true,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
      });
      newSaved[participantId] = score;
    }

    setSaved(prev => ({ ...prev, ...newSaved }));
    setScores({});
    setSaving(false);
    onSaved();
  };

  const pendingCount = Object.entries(scores).filter(([, v]) => v !== "" && v !== null && v !== undefined).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📝 後測P1 紙本成績輸入</h2>
            <p className="text-xs text-gray-500 mt-0.5">輸入分數後按「儲存」，將自動寫入後測成就測驗（QuizResult post）</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3 flex-wrap flex-shrink-0">
          <input
            type="text"
            placeholder="搜尋姓名、ID、學號..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部班級</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-gray-400 self-center">共 {filtered.length} 人</span>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 px-6 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 font-semibold w-24">參與者ID</th>
                <th className="text-left py-2 font-semibold w-16">班級</th>
                <th className="text-left py-2 font-semibold w-20">姓名</th>
                <th className="text-left py-2 font-semibold w-28">學號</th>
                <th className="text-left py-2 font-semibold w-24">現有分數</th>
                <th className="text-left py-2 font-semibold">輸入新分數（0–100）</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const existing = getExistingScore(p.id);
                const inputVal = scores[p.id] ?? "";
                const justSaved = p.id in saved;
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-blue-600">{p.participant_id}</td>
                    <td className="py-2 text-xs text-gray-600">{p.class_id || "—"}</td>
                    <td className="py-2 text-xs text-gray-700">{p.name || "—"}</td>
                    <td className="py-2 text-xs text-gray-500 font-mono">{p.student_id || "—"}</td>
                    <td className="py-2">
                      {justSaved ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">✅ {saved[p.id]}</span>
                      ) : existing !== null ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">{existing} 分</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={inputVal}
                        onChange={e => setScores(prev => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="輸入分數"
                        className="w-32 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-10 text-sm">沒有符合條件的學生</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-gray-500">
            {pendingCount > 0 ? (
              <span className="text-amber-600 font-medium">⚠ 有 {pendingCount} 筆待儲存</span>
            ) : (
              "請在上方輸入各學生分數"
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              關閉
            </button>
            <button
              onClick={handleSave}
              disabled={saving || pendingCount === 0}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? "儲存中…" : `💾 儲存 ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}