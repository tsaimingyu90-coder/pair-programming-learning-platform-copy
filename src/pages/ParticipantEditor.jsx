import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { useNetworkMode } from "@/hooks/useNetworkMode";
import DegradedBanner from "@/components/DegradedBanner";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

const CLASS_OPTIONS = ["電子一甲", "電子一乙", "電子二甲", "電子二乙"];
const GENDER_OPTIONS = ["男", "女", "其他"];
const GROUP_OPTIONS = ["AI_Pair", "AI_Solo"];

function ParticipantEditorInner() {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("全部");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [notice, setNotice] = useState({ type: "", message: "" });
  const { isDegradedMode } = useNetworkMode();

  useEffect(() => {
    loadParticipants();
  }, []);

  const loadParticipants = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Participant.list("-created_date");
      setParticipants(data);
    } catch (err) {
      console.error("Failed to load participants:", err);
      showNotice("error", "載入失敗，請重試");
    } finally {
      setLoading(false);
    }
  };

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice({ type: "", message: "" }), 3000);
  };

  const handleEdit = (participant) => {
    setEditingId(participant.id);
    setEditForm({
      participant_id: participant.participant_id,
      name: participant.name,
      student_id: participant.student_id,
      class_id: participant.class_id,
      gender: participant.gender,
      years_experience: participant.years_experience,
      group: participant.group,
      consent: participant.consent,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await base44.entities.Participant.update(editingId, editForm);
      showNotice("success", "儲存成功");
      setEditingId(null);
      loadParticipants();
    } catch (err) {
      console.error("Failed to update:", err);
      showNotice("error", "儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (participant) => {
    if (!confirm(`確定要刪除 "${participant.name}" (${participant.participant_id}) 嗎？\n\n警告：此操作將刪除該參與者的所有相關資料（包含作答紀錄、聊天紀錄等）。`)) return;
    
    try {
      const res = await base44.functions.invoke("deleteParticipantData", { participantId: participant.participant_id });
      if (res.data.success) {
        showNotice("success", `已刪除 ${res.data.deleted_count} 筆記錄`);
        loadParticipants();
      } else {
        showNotice("error", res.data.error || "刪除失敗");
      }
    } catch (err) {
      console.error("Failed to delete:", err);
      showNotice("error", "刪除失敗，請重試");
    }
  };

  const filtered = participants.filter(p => {
    const matchSearch = search === "" || 
      p.participant_id.toLowerCase().includes(search.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.student_id && p.student_id.toLowerCase().includes(search.toLowerCase()));
    const matchClass = classFilter === "全部" || p.class_id === classFilter;
    return matchSearch && matchClass;
  });

  const classOptions = ["全部", ...CLASS_OPTIONS];

  return (
    <div className="min-h-screen bg-gray-50">
      {isDegradedMode && <DegradedBanner />}
      
      {notice.message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
          notice.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {notice.message}
        </div>
      )}

      <div className="p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">參與者資料編輯</h1>
              <p className="text-sm text-gray-500 mt-0.5">直接編輯 Participant 資料庫記錄</p>
            </div>
            <a href={createPageUrl("ParticipantManager")} className="text-xs text-gray-400 hover:text-gray-600">← 返回管理頁面</a>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex gap-3 items-center">
            <input
              type="text"
              placeholder="搜尋參與者 ID、姓名、學號…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-gray-400">{filtered.length} 筆</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">無符合資料</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["參與者 ID", "姓名", "學號", "班級", "性別", "年資", "組別", "同意", "操作"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(p => (
                      <tr key={p.id} className={editingId === p.id ? "bg-blue-50" : "hover:bg-gray-50"}>
                        {editingId === p.id ? (
                          // Editing mode
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.participant_id}
                                onChange={(e) => setEditForm(f => ({ ...f, participant_id: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.student_id}
                                onChange={(e) => setEditForm(f => ({ ...f, student_id: e.target.value.toUpperCase() }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={editForm.class_id}
                                onChange={(e) => setEditForm(f => ({ ...f, class_id: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={editForm.gender}
                                onChange={(e) => setEditForm(f => ({ ...f, gender: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="20"
                                value={editForm.years_experience}
                                onChange={(e) => setEditForm(f => ({ ...f, years_experience: parseFloat(e.target.value) || 0 }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={editForm.group}
                                onChange={(e) => setEditForm(f => ({ ...f, group: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={editForm.consent}
                                onChange={(e) => setEditForm(f => ({ ...f, consent: e.target.checked }))}
                                className="w-4 h-4 accent-blue-600"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={handleSave}
                                  disabled={saving}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition"
                                >
                                  {saving ? "儲存中…" : "✓ 儲存"}
                                </button>
                                <button
                                  onClick={handleCancel}
                                  disabled={saving}
                                  className="px-3 py-1 bg-gray-500 text-white rounded text-xs font-medium hover:bg-gray-600 disabled:opacity-50 transition"
                                >
                                  取消
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          // View mode
                          <>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.participant_id}</td>
                            <td className="px-4 py-3 text-gray-600">{p.name || "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.student_id || "—"}</td>
                            <td className="px-4 py-3 text-gray-600">{p.class_id}</td>
                            <td className="px-4 py-3 text-gray-600">{p.gender}</td>
                            <td className="px-4 py-3 text-gray-600">{p.years_experience} 年</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.group === "AI_Pair" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                {p.group}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.consent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {p.consent ? "✓ 已同意" : "✗ 未同意"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEdit(p)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition"
                                >
                                  ✏️ 編輯
                                </button>
                                <button
                                  onClick={() => handleDelete(p)}
                                  className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition"
                                >
                                  🗑 刪除
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ParticipantEditor() {
  return (
    <TeacherAuthGuard>
      <ParticipantEditorInner />
    </TeacherAuthGuard>
  );
}