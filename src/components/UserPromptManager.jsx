import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function UserPromptManager({ participantId, onClose }) {
  const [prompts, setPrompts] = useState([]);
  const [newContent, setNewContent] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!participantId) return;
    base44.entities.UserPrompt.filter({ participant_id: participantId }).then(setPrompts);
  }, [participantId]);

  const handleAdd = async () => {
    if (!newContent.trim() || !participantId) return;
    setSaving(true);
    const created = await base44.entities.UserPrompt.create({
      participant_id: participantId,
      content: newContent.trim(),
      label: newLabel.trim() || null,
      order: prompts.length,
    });
    setPrompts((p) => [...p, created]);
    setNewContent("");
    setNewLabel("");
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.UserPrompt.delete(id);
    setPrompts((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">管理自訂提示詞</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Add new */}
        <div className="space-y-2 mb-4">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="標題（選填）"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="輸入提示詞內容…"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newContent.trim()}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition"
          >
            {saving ? "新增中…" : "+ 新增提示詞"}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {prompts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">尚無自訂提示詞</p>
          )}
          {prompts.map((p) => (
            <div key={p.id} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
              <div className="flex-1 min-w-0">
                {p.label && <p className="text-xs font-semibold text-gray-500 mb-0.5">{p.label}</p>}
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.content}</p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-red-400 hover:text-red-600 text-xs flex-shrink-0 mt-0.5"
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}