import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const TAG_COLORS = [
  { key: "blue",   bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300" },
  { key: "green",  bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300" },
  { key: "red",    bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300" },
  { key: "amber",  bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300" },
  { key: "purple", bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
  { key: "gray",   bg: "bg-gray-100",   text: "text-gray-700",   border: "border-gray-300" },
];

const getColorClasses = (key) =>
  TAG_COLORS.find(c => c.key === key) || TAG_COLORS[0];

const ASSESSMENT_OPTIONS = ["優秀", "良好", "普通", "需加強"];
const ASSESSMENT_COLOR = {
  "優秀":  "bg-green-100 text-green-700 border-green-300",
  "良好":  "bg-blue-100 text-blue-700 border-blue-300",
  "普通":  "bg-gray-100 text-gray-600 border-gray-300",
  "需加強":"bg-red-100 text-red-700 border-red-300",
};

// 行為標籤分類定義
const BEHAVIOR_CATEGORIES = [
  {
    id: "cognitive",
    label: "一、認知投入",
    color: "blue",
    bg: "bg-blue-50",
    border: "border-blue-200",
    tagBg: "bg-blue-100",
    tagText: "text-blue-700",
    tagBorder: "border-blue-300",
    tagHover: "hover:bg-blue-200",
    behaviors: ["主動解題", "試誤測試", "有策略除錯", "無效試誤", "放棄行為"],
  },
  {
    id: "affective",
    label: "二、情意反應",
    color: "amber",
    bg: "bg-amber-50",
    border: "border-amber-200",
    tagBg: "bg-amber-100",
    tagText: "text-amber-700",
    tagBorder: "border-amber-300",
    tagHover: "hover:bg-amber-200",
    behaviors: ["焦慮表現", "挫折反應", "自信表現"],
  },
  {
    id: "collaborative",
    label: "三、協作互動",
    color: "green",
    bg: "bg-green-50",
    border: "border-green-200",
    tagBg: "bg-green-100",
    tagText: "text-green-700",
    tagBorder: "border-green-300",
    tagHover: "hover:bg-green-200",
    behaviors: ["有效討論", "角色分工", "依賴他人"],
  },
  {
    id: "ai",
    label: "四、AI互動",
    color: "purple",
    bg: "bg-purple-50",
    border: "border-purple-200",
    tagBg: "bg-purple-100",
    tagText: "text-purple-700",
    tagBorder: "border-purple-300",
    tagHover: "hover:bg-purple-200",
    behaviors: ["有效AI使用", "無效AI使用"],
  },
  {
    id: "offtask",
    label: "五、偏離行為",
    color: "red",
    bg: "bg-red-50",
    border: "border-red-200",
    tagBg: "bg-red-100",
    tagText: "text-red-700",
    tagBorder: "border-red-300",
    tagHover: "hover:bg-red-200",
    behaviors: ["手機玩遊戲", "電腦玩遊戲", "電腦看影片", "手機看影片", "低參與狀態", "聊天", "干擾行為"],
  },
];

export default function StudentNotesPanel({ participantDbId }) {
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState("blue");
  const [addingTag, setAddingTag] = useState(false);
  const [flashBehavior, setFlashBehavior] = useState(null); // label of recently clicked

  const [showAddNote, setShowAddNote] = useState(false);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteContent, setNoteContent] = useState("");
  const [noteAssessment, setNoteAssessment] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!participantDbId) return;
    base44.entities.StudentTag.filter({ participant_id: participantDbId }).then(setTags);
    base44.entities.ClassNote.filter({ participant_id: participantDbId }, "-date").then(setNotes);
  }, [participantDbId]);

  const handleAddTag = async () => {
    if (!tagInput.trim()) return;
    setAddingTag(true);
    const tag = await base44.entities.StudentTag.create({
      participant_id: participantDbId,
      label: tagInput.trim(),
      color: tagColor,
    });
    setTags(prev => [...prev, tag]);
    setTagInput("");
    setAddingTag(false);
  };

  const handleDeleteTag = async (id) => {
    await base44.entities.StudentTag.delete(id);
    setTags(prev => prev.filter(t => t.id !== id));
  };

  // 快速新增行為紀錄
  const handleBehaviorClick = async (behavior, categoryLabel) => {
    setFlashBehavior(behavior);
    setTimeout(() => setFlashBehavior(null), 800);

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const content = `[${categoryLabel}] ${behavior}（${timeStr}）`;

    const note = await base44.entities.ClassNote.create({
      participant_id: participantDbId,
      date: dateStr,
      content,
      assessment: "",
    });
    setNotes(prev => [note, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  };

  const handleAddNote = async () => {
    if (!noteContent.trim() || !noteDate) return;
    setSavingNote(true);
    const note = await base44.entities.ClassNote.create({
      participant_id: participantDbId,
      date: noteDate,
      content: noteContent.trim(),
      assessment: noteAssessment,
    });
    setNotes(prev => [note, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    setNoteContent("");
    setNoteAssessment("");
    setNoteDate(new Date().toISOString().split("T")[0]);
    setShowAddNote(false);
    setSavingNote(false);
  };

  const handleDeleteNote = async (id) => {
    await base44.entities.ClassNote.delete(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* 學生行為標記 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">🏷️ 學生行為標記</h2>

        {/* 行為標籤快速點擊區 */}
        <div className="space-y-3 mb-4">
          {BEHAVIOR_CATEGORIES.map(cat => (
            <div key={cat.id} className={`rounded-lg border p-3 ${cat.bg} ${cat.border}`}>
              <p className={`text-xs font-bold mb-2 ${cat.tagText}`}>{cat.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.behaviors.map(b => (
                  <button
                    key={b}
                    onClick={() => handleBehaviorClick(b, cat.label.split("、")[1])}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer
                      ${cat.tagBg} ${cat.tagText} ${cat.tagBorder} ${cat.tagHover}
                      ${flashBehavior === b ? "ring-2 ring-offset-1 ring-gray-400 scale-95" : ""}
                    `}
                    title={`點擊記錄：${b}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 自訂標籤 */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">自訂標籤</p>
          <div className="flex flex-wrap gap-2 mb-3 min-h-6">
            {tags.length === 0 && <p className="text-xs text-gray-400">尚無自訂標記</p>}
            {tags.map(tag => {
              const c = getColorClasses(tag.color);
              return (
                <span
                  key={tag.id}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${c.bg} ${c.text} ${c.border}`}
                >
                  {tag.label}
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    className="ml-0.5 hover:opacity-60 transition text-xs leading-none"
                    title="刪除"
                  >×</button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddTag()}
              placeholder="輸入自訂標籤…"
              maxLength={20}
              className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setTagColor(c.key)}
                  className={`w-5 h-5 rounded-full border-2 transition ${c.bg} ${tagColor === c.key ? "border-gray-600 scale-110" : "border-transparent"}`}
                  title={c.key}
                />
              ))}
            </div>
            <button
              onClick={handleAddTag}
              disabled={addingTag || !tagInput.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition"
            >
              + 新增
            </button>
          </div>
        </div>
      </div>

      {/* 質性紀錄 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">📋 質性紀錄</h2>
          <button
            onClick={() => setShowAddNote(v => !v)}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
          >
            {showAddNote ? "取消" : "+ 新增紀錄"}
          </button>
        </div>

        {showAddNote && (
          <div className="mb-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 mb-1 block">日期</label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={e => setNoteDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 mb-1 block">評估</label>
                <select
                  value={noteAssessment}
                  onChange={e => setNoteAssessment(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">不填</option>
                  {ASSESSMENT_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">內容</label>
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="輸入觀察紀錄、課堂表現…"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
            <button
              onClick={handleAddNote}
              disabled={savingNote || !noteContent.trim() || !noteDate}
              className="w-full py-2 bg-indigo-600 text-white text-xs rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              {savingNote ? "儲存中…" : "💾 儲存紀錄"}
            </button>
          </div>
        )}

        {notes.length === 0 && !showAddNote && (
          <p className="text-xs text-gray-400">尚無質性紀錄</p>
        )}
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-600">
                  {note.date}
                  {note.created_date && (
                    <span className="ml-1.5 font-normal text-gray-400">
                      {new Date(note.created_date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {note.assessment && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ASSESSMENT_COLOR[note.assessment] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {note.assessment}
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-xs text-gray-300 hover:text-red-500 transition"
                    title="刪除"
                  >🗑</button>
                </div>
              </div>
              <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}