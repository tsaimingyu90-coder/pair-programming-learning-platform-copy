import { useState } from "react";

const DEFAULT_TEMPLATES = [
  {
    id: "t1",
    name: "簡潔版",
    content: "請用簡短回饋評分此程式，限制在100字內，使用純文字，不要使用Markdown，不要條列，重點說優點、缺點與等第即可。",
  },
  {
    id: "t2",
    name: "稍微有結構",
    content: "請用精簡方式評語，限150字內，僅用純文字，不要Markdown、不用條列。內容包含：優點一句、缺點一句、建議一句、等第。",
  },
  {
    id: "t3",
    name: "極短版",
    content: "請用50字內評語，純文字輸出，不要Markdown，只給結論與等第。",
  },
  {
    id: "t4",
    name: "教師口吻精簡",
    content: "請用教師口吻給簡短評語，限100字內，純文字，不要Markdown、不條列，只說重點與等第。",
  },
];

const STORAGE_KEY = "feedback_prompt_templates";

function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_TEMPLATES;
}

function saveTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function FeedbackPromptSettings({ selectedId, onSelect, onClose }) {
  const [templates, setTemplates] = useState(loadTemplates);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!newName.trim() || !newContent.trim()) return;
    const updated = [...templates, { id: Date.now().toString(), name: newName.trim(), content: newContent.trim() }];
    setTemplates(updated);
    saveTemplates(updated);
    setNewName("");
    setNewContent("");
    setAdding(false);
  };

  const handleDelete = (id) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
    if (selectedId === id) onSelect(null, null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">AI 提示詞設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <p className="text-xs text-gray-500 mb-3">選擇一個模板作為 AI 評語的回應格式指引：</p>

        <div className="space-y-2 mb-4">
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => onSelect(t.id, t.content)}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selectedId === t.id
                  ? "bg-purple-50 border-purple-400"
                  : "bg-gray-50 border-gray-200 hover:border-purple-300"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700">{t.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {selectedId === t.id && (
                  <span className="text-purple-600 text-xs font-bold">✓</span>
                )}
                {!DEFAULT_TEMPLATES.find(d => d.id === t.id) && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                    className="text-xs text-red-400 hover:text-red-600 ml-1"
                  >✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="border border-purple-200 rounded-lg p-3 bg-purple-50 space-y-2 mb-3">
            <input
              type="text"
              placeholder="模板名稱"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            <textarea
              placeholder="提示詞內容"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg font-medium hover:bg-purple-700 transition">新增</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition">取消</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-purple-400 hover:text-purple-600 transition mb-3"
          >
            + 新增模板
          </button>
        )}

        <div className="flex justify-between">
          {selectedId && (
            <button onClick={() => onSelect(null, null)} className="text-xs text-gray-400 hover:text-gray-600">清除選擇</button>
          )}
          <button onClick={onClose} className="ml-auto px-4 py-2 bg-gray-800 text-white text-xs rounded-lg font-medium hover:bg-gray-900 transition">完成</button>
        </div>
      </div>
    </div>
  );
}