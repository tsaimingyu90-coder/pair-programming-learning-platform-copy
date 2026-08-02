import { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { LanguageSelector, getHighlightedLines } from "@/components/SyntaxHighlighter";

export default function EditableCodeBlock({ initialCode, assignmentId, participantDbId }) {
  const { isPreview } = usePreviewMode();
  const [code, setCode] = useState(initialCode || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [language, setLanguage] = useState('c');
  const [theme, setTheme] = useState('light');
  const [existingNoteId, setExistingNoteId] = useState(null);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const highlightedLines = useMemo(() => getHighlightedLines(code, language), [code, language]);

  // Load existing note if any
  useEffect(() => {
    if (!participantDbId || !assignmentId) return;
    base44.entities.ExampleNote.filter({ participant: participantDbId, assignment_id: assignmentId })
      .then(notes => {
        if (notes.length > 0) {
          setCode(notes[0].content);
          setExistingNoteId(notes[0].id);
        }
      });
  }, [participantDbId, assignmentId]);

  // Load language preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`code-language-${assignmentId}`);
    if (saved) setLanguage(saved);
  }, [assignmentId]);

  // Load theme preference from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem(`code-theme-${assignmentId}`);
    if (savedTheme) setTheme(savedTheme);
  }, [assignmentId]);

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (assignmentId) localStorage.setItem(`code-language-${assignmentId}`, newLang);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    if (assignmentId) localStorage.setItem(`code-theme-${assignmentId}`, newTheme);
  };

  const lines = code.split("\n");
  const lineCount = lines.length;

  const syncScroll = (e) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.target.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
      highlightRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const handleSave = async () => {
    if (!participantDbId) return;
    if (isPreview) {
      // Preview mode: don't save to real data
      console.log("[EditableCodeBlock][Preview] skipped saving note");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    setSaving(true);
    const payload = {
      participant: participantDbId,
      assignment_id: assignmentId,
      content: code,
      submitted_at: new Date().toISOString(),
    };
    if (existingNoteId) {
      await base44.entities.ExampleNote.update(existingNoteId, payload);
    } else {
      const created = await base44.entities.ExampleNote.create(payload);
      setExistingNoteId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-1">
        <p className="text-xs text-gray-400 order-2 lg:order-1">
          {editing ? "可直接在程式碼中追加註解（使用 // 或 /* */）" : "點擊「編輯」以新增註解"}
        </p>
        <div className="flex gap-2 items-center order-1 lg:order-2">
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="light"><span className="hidden lg:inline">淺色主題</span><span className="lg:hidden">淺色</span></option>
            <option value="dark"><span className="hidden lg:inline">深色主題</span><span className="lg:hidden">深色</span></option>
          </select>
          <LanguageSelector value={language} onChange={handleLanguageChange} />
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition whitespace-nowrap"
            >
              <span className="hidden lg:inline">✏️ 編輯筆記</span><span className="lg:hidden">✏️ 編輯</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition whitespace-nowrap ${
                  saved
                    ? "bg-green-100 text-green-700 border-green-300"
                    : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                } disabled:opacity-50`}
              >
                {saving ? "儲存中…" : saved ? "✓ 已儲存" : "💾 儲存"}
              </button>
            </>
          )}
        </div>
        </div>
        <div className={`flex rounded-lg border overflow-hidden font-mono text-sm relative ${
          theme === 'dark'
            ? 'bg-gray-900 border-gray-700'
            : 'bg-gray-50 border-gray-200'
        }`}>
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className={`select-none border-r text-right px-1.5 py-3 overflow-hidden ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-gray-500'
              : 'bg-gray-100 border-gray-200 text-gray-400'
          }`}
          style={{ minWidth: "2.5rem", lineHeight: "1.5rem", fontSize: "0.75rem" }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ lineHeight: "1.5rem" }}>{i + 1}</div>
          ))}
        </div>
        {/* Syntax highlighted display — always visible */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: `${Math.max(lineCount, 5) * 1.5}rem` }}>
          {/* Highlight overlay */}
          <div
            ref={highlightRef}
            className={`absolute inset-0 px-2 py-3 overflow-hidden ${editing ? "pointer-events-none" : ""}`}
            style={{ lineHeight: "1.5rem", whiteSpace: "pre" }}
          >
            <pre className={`text-sm m-0 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}
              style={{ lineHeight: "1.5rem", whiteSpace: "pre" }}>
              {highlightedLines.map((line, idx) => (
                <div key={idx} dangerouslySetInnerHTML={{ __html: line || " " }} />
              ))}
            </pre>
          </div>
          {/* Editable textarea (transparent text, only shown in editing mode) */}
          {editing ? (
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              onScroll={syncScroll}
              spellCheck={false}
              autoFocus
              className="absolute inset-0 w-full h-full bg-transparent resize-none outline-none px-2 py-3 text-sm overflow-auto"
              style={{
                lineHeight: "1.5rem",
                whiteSpace: "pre",
                color: "transparent",
                caretColor: theme === 'dark' ? '#d4d4d4' : '#1e1e1e',
                fontFamily: "inherit",
              }}
            />
          ) : null}
        </div>
        </div>
    </div>
  );
}