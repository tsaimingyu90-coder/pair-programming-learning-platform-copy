import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function FeedbackTemplateManager({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    const data = await base44.entities.FeedbackTemplate.list("order");
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    await base44.entities.FeedbackTemplate.create({ content: newText.trim(), order: templates.length });
    setNewText("");
    await load();
    setAdding(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    await base44.entities.FeedbackTemplate.delete(id);
    await load();
    setDeletingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">管理評語選單</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">尚無評語，請在下方新增</p>
          ) : (
            templates.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                <span className="flex-1 text-sm text-gray-800">{t.content}</span>
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={deletingId === t.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition px-2 py-1 rounded hover:bg-red-50"
                >
                  {deletingId === t.id ? "…" : "刪除"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 p-4 space-y-2">
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="輸入新評語…"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {adding ? "新增中…" : "+ 新增評語"}
          </button>
        </div>
      </div>
    </div>
  );
}