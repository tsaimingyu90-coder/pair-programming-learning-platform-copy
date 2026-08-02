import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import LatexRenderer from "@/components/LatexRenderer";
import AttemptUnlockPanel from "@/components/AttemptUnlockPanel";
import AssignmentBatchOpenPanel from "@/components/AssignmentBatchOpenPanel";
import PretestUnlockPanel from "@/components/PretestUnlockPanel";
import PosttestUnlockPanel from "@/components/PosttestUnlockPanel";
import CSVVersionManager from "@/components/CSVVersionManager";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

const EMPTY_FORM = {
  assignment_id: "",
  week_number: "",
  task_number: "",
  title: "",
  question_type: "CodeProblem",
  difficulty_label: "",
  prompt_text: "",
  example_title: "",
  example_subtitle: "",
  example_code: "",
  example_image_url: "",
  assignment_image_url: "",
  hint_text: "",
  allow_ai: false,
  is_open: false,
  rubric: "",
  answer: "",
};

const QUESTION_TYPE_LABELS = {
  CodeProblem: "程式題",
  ConceptProblem: "概念題",
};

const MAX_IMAGES = 5;

function MultiImageUploader({ label, prefix, form, set, onPreview }) {
  const [uploading, setUploading] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const inputRef = useRef();

  const allUrlKeys = Array.from({ length: MAX_IMAGES }, (_, i) =>
    i === 0 ? `${prefix}_image_url` : `${prefix}_image_url${i + 1}`
  );
  const allLabelKeys = Array.from({ length: MAX_IMAGES }, (_, i) =>
    i === 0 ? `${prefix}_image_label` : `${prefix}_image_label${i + 1}`
  );

  // Current items: [{url, label}]
  const items = allUrlKeys
    .map((k, i) => ({ url: form[k] || "", label: form[allLabelKeys[i]] || "" }))
    .filter(item => item.url);

  const writeItems = (newItems) => {
    const updates = {};
    allUrlKeys.forEach((k, i) => { updates[k] = newItems[i]?.url || ""; });
    allLabelKeys.forEach((k, i) => { updates[k] = newItems[i]?.label || ""; });
    set(updates);
  };

  const removeImage = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    writeItems(next);
  };

  const handleLabelChange = (idx, val) => {
    const next = items.map((item, i) => i === idx ? { ...item, label: val } : item);
    writeItems(next);
  };

  // Drag handlers
  const onDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    writeItems(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        {items.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-100 transition"
          >
            + 新增圖片
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          setUploading(true);
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          const next = [...items, { url: file_url, label: "" }];
          writeItems(next);
          setUploading(false);
          e.target.value = "";
        }}
      />

      {items.length === 0 && (
        <p className="text-xs text-gray-400 italic">尚無圖片，點擊「新增圖片」上傳</p>
      )}

      <div className="flex flex-wrap gap-3 mt-1">
        {items.map((item, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={e => onDragStart(e, idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={e => onDrop(e, idx)}
            onDragEnd={onDragEnd}
            className={`relative group flex flex-col gap-1 cursor-grab active:cursor-grabbing transition-all ${dragOverIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-400 rounded-lg" : ""}`}
            style={{ width: "112px" }}
          >
            {/* Drag handle indicator */}
            <div className="absolute top-1 left-1 text-gray-300 text-[10px] opacity-0 group-hover:opacity-100 select-none pointer-events-none z-10">⠿⠿</div>
            <img
              src={item.url}
              alt={`預覽 ${idx + 1}`}
              onClick={e => { e.stopPropagation(); onPreview?.(item.url, items.map(i => i.url), idx); }}
              className="h-20 w-full rounded border border-gray-200 object-contain bg-gray-50 cursor-zoom-in hover:opacity-80 transition"
            />
            {/* Zoom hint */}
            <div className="absolute inset-x-0 bottom-6 flex justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition">
              <span className="text-[9px] bg-black/50 text-white rounded px-1">🔍 點擊放大</span>
            </div>
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition leading-none z-10"
            >✕</button>
            <input
              type="text"
              value={item.label}
              onChange={e => handleLabelChange(idx, e.target.value)}
              placeholder={`圖${idx + 1}`}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              className="w-full text-[11px] text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          </div>
        ))}
        {uploading && (
          <div className="h-20 w-28 rounded border border-blue-200 bg-blue-50 flex items-center justify-center">
            <span className="text-xs text-blue-500">上傳中…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeEditor({ value, onChange, rows = 8 }) {
  const lines = (value || "").split("\n");
  const lineCount = Math.max(lines.length, rows);
  return (
    <div className="flex bg-gray-900 rounded-lg overflow-hidden text-xs mt-1" style={{ minHeight: `${lineCount * 1.5 + 1.5}rem` }}>
      <div
        className="select-none text-gray-500 text-right px-2 py-3 border-r border-gray-700 flex-shrink-0"
        style={{ minWidth: "2.2rem", lineHeight: "1.5rem" }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} style={{ lineHeight: "1.5rem" }}>{i + 1}</div>
        ))}
      </div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 bg-transparent text-gray-100 px-3 py-3 font-mono resize-none focus:outline-none w-full"
        style={{ lineHeight: "1.5rem", minHeight: `${lineCount * 1.5 + 1.5}rem` }}
      />
    </div>
  );
}

function AssignmentForm({ initial, onSave, onCancel, onPreview }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (kOrObj, v) => {
    if (typeof kOrObj === "object") {
      setForm((f) => ({ ...f, ...kOrObj }));
    } else {
      setForm((f) => ({ ...f, [kOrObj]: v }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      week_number: Number(form.week_number),
      task_number: Number(form.task_number),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Assignment ID *</label>
          <input required value={form.assignment_id} onChange={(e) => set("assignment_id", e.target.value)}
            placeholder="W1_T1" className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">週次 *</label>
          <input required type="number" min={1} max={6} value={form.week_number} onChange={(e) => set("week_number", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">任務號 *</label>
          <input required type="number" min={1} max={10} value={form.task_number} onChange={(e) => set("task_number", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">任務標題</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">課堂範例</p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">範例標題</label>
            <input value={form.example_title} onChange={(e) => set("example_title", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">範例副標題</label>
            <input value={form.example_subtitle} onChange={(e) => set("example_subtitle", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">範例程式碼</label>
          <CodeEditor value={form.example_code} onChange={(v) => set("example_code", v)} rows={8} />
        </div>
        <MultiImageUploader label="範例圖片（可多張）" prefix="example" form={form} set={set} onPreview={onPreview} />
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">課堂作業</p>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">作業內容 (prompt)</label>
          <textarea value={form.prompt_text} onChange={(e) => set("prompt_text", e.target.value)}
            rows={4} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          {form.prompt_text && (
            <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
              <p className="font-semibold mb-1 text-gray-400 uppercase tracking-wide text-[10px]">預覽（LaTeX）</p>
              <div className="text-sm text-gray-800">
                <LatexRenderer>{form.prompt_text}</LatexRenderer>
              </div>
            </div>
          )}
        </div>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">提示內容 (hint)</label>
          <textarea value={form.hint_text} onChange={(e) => set("hint_text", e.target.value)}
            rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">題型類別</label>
          <select value={form.question_type || "CodeProblem"} onChange={(e) => set("question_type", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            <option value="CodeProblem">CodeProblem（程式題）</option>
            <option value="ConceptProblem">ConceptProblem（概念題）</option>
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">課堂作業難度標籤（選填）</label>
          <select value={form.difficulty_label || ""} onChange={(e) => set("difficulty_label", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            <option value="">（不設定）</option>
            <option value="★☆☆ 簡單">★☆☆ 簡單</option>
            <option value="★★☆ 中等">★★☆ 中等</option>
            <option value="★★★ 困難">★★★ 困難</option>
          </select>
        </div>
        <MultiImageUploader label="作業圖片（可多張）" prefix="assignment" form={form} set={set} onPreview={onPreview} />
        <div className="mt-3 flex items-center gap-2">
          <input type="checkbox" id="allow_ai" checked={form.allow_ai} onChange={(e) => set("allow_ai", e.target.checked)}
            className="w-4 h-4 accent-blue-600" />
          <label htmlFor="allow_ai" className="text-sm text-gray-700 font-medium">允許使用 AI</label>
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">評分與解答</p>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">評分標準 (rubric)</label>
          <textarea value={form.rubric} onChange={(e) => set("rubric", e.target.value)}
            rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">參考解答 (answer)</label>
          <CodeEditor value={form.answer} onChange={(v) => set("answer", v)} rows={6} />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">儲存</button>
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">取消</button>
      </div>
    </form>
  );
}

// ── Fallback CSV column order (used before schema loads) ──────────────────────
const FALLBACK_CSV_COLS = [
  "assignment_id","week_number","task_number","title","question_type","difficulty_label",
  "prompt_text","hint_text",
  "example_title","example_subtitle","example_code",
  "example_image_url","example_image_label",
  "example_image_url2","example_image_label2",
  "example_image_url3","example_image_label3",
  "example_image_url4","example_image_label4",
  "example_image_url5","example_image_label5",
  "assignment_image_url","assignment_image_label",
  "assignment_image_url2","assignment_image_label2",
  "assignment_image_url3","assignment_image_label3",
  "assignment_image_url4","assignment_image_label4",
  "assignment_image_url5","assignment_image_label5",
  "allow_ai","is_open","rubric","answer",
];

// Build label from description or fallback to formatted key
function buildColLabel(key, description) {
  if (description) return description.split("（")[0].split("(")[0].trim().slice(0, 12);
  return key.replace(/_/g, " ");
}

// Derive ordered col list from schema properties, keeping priority cols first
function schemaToColList(schemaProps) {
  const PRIORITY = ["assignment_id","week_number","task_number"];
  const keys = Object.keys(schemaProps);
  const rest = keys.filter(k => !PRIORITY.includes(k));
  return [...PRIORITY.filter(k => keys.includes(k)), ...rest];
}

// ── RFC-4180 compliant CSV parser ─────────────────────────────────────────────
function parseCSV(text) {
  // Strip UTF-8 BOM
  const raw = text.replace(/^\uFEFF/, "");
  const rows = [];
  let i = 0;
  const n = raw.length;

  while (i < n) {
    const row = [];
    // Parse one row
    while (i < n) {
      let field = "";
      if (raw[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < n) {
          if (raw[i] === '"') {
            if (raw[i + 1] === '"') { field += '"'; i += 2; } // escaped quote
            else { i++; break; } // closing quote
          } else {
            field += raw[i++];
          }
        }
      } else {
        // Unquoted field
        while (i < n && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') {
          field += raw[i++];
        }
      }
      row.push(field);
      if (i < n && raw[i] === ',') { i++; continue; }
      break;
    }
    // Skip \r\n or \n
    if (i < n && raw[i] === '\r') i++;
    if (i < n && raw[i] === '\n') i++;
    rows.push(row);
  }
  return rows;
}

// ── Find header row (first row whose first cell matches a known column) ───────
function findHeaderRow(rows) {
  const knownCols = new Set(FALLBACK_CSV_COLS);
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some(cell => knownCols.has(cell.trim()))) return i;
  }
  return 0; // fallback
}

// ── Parse bool ────────────────────────────────────────────────────────────────
function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function AssignmentManagerInner() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("assignments"); // "assignments" | "batch_open" | "unlock"
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [editing, setEditing] = useState(null); // null | 'new' | assignment object
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { valid, skipped, fatalError, importMode, preCheck }
  const [importChecks, setImportChecks] = useState({ colCount: false, rowCount: false, content: false });
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null); // { created, updated, failed, errors, total }
  const [versionManagerOpen, setVersionManagerOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { images: [], index: number }
  const importRef = useRef();

  const openLightbox = (url, images, index) => setLightbox({ images, index: index ?? images.indexOf(url) });
  const closeLightbox = () => setLightbox(null);

  // ── CSV Export settings ───────────────────────────────────────────────────
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportCols, setExportCols] = useState(() =>
    FALLBACK_CSV_COLS.map(col => ({ col, enabled: true, label: col }))
  );
  // Drag state refs (no re-render during drag)
  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const assignments_data = await base44.entities.Assignment.list();
      assignments_data.sort((a, b) => a.week_number - b.week_number || a.task_number - b.task_number);
      setAssignments(assignments_data);
    } catch (e) {
      console.error("[AssignmentManager] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => {
      if (e.key === "ArrowRight") setLightbox(l => ({ ...l, index: (l.index + 1) % l.images.length }));
      else if (e.key === "ArrowLeft") setLightbox(l => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length }));
      else if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  const weeks = [...new Set(assignments.map((a) => a.week_number))].sort((a, b) => a - b);

  const filtered = assignments.filter((a) => {
    const matchWeek = selectedWeek === "all" || String(a.week_number) === selectedWeek;
    const matchSearch = !search || a.title?.includes(search) || a.assignment_id?.includes(search);
    return matchWeek && matchSearch;
  });

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (editing === "new") {
        await base44.entities.Assignment.create({ ...form, is_open: form.is_open ?? false });
      } else {
        await base44.entities.Assignment.update(editing.id, form);
      }
      setEditing(null);
      await load();
    } catch (e) {
      console.error("[AssignmentManager] save failed", e);
      alert("儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null); // id to delete

  const handleDelete = (id) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Assignment.delete(deleteTarget);
    setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget));
    if (editing && editing !== "new" && editing.id === deleteTarget) setEditing(null);
    setDeleteTarget(null);
  };

  // ── CSV Export (RFC-4180, multi-line fields supported) ──────────────────────
  const handleExport = () => {
    const escapeField = (v) => {
      const s = String(v ?? "");
      if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const activeCols = exportCols.filter(c => c.enabled).map(c => c.col);
    const header = activeCols.join(",");
    const rows = assignments.map((a) =>
      activeCols.map((k) => escapeField(a[k] ?? "")).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assignments.csv";
    a.click();
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
  };

  // ── Drag handlers for horizontal col reorder ──────────────────────────────
  const handleColDragStart = (e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx); // required for Firefox
  };

  const handleColDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverIdx.current = idx;
    // Live visual reorder while dragging
    if (dragIdx.current !== null && dragIdx.current !== idx) {
      setExportCols(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx.current, 1);
        next.splice(idx, 0, moved);
        dragIdx.current = idx; // update so continuous drag works
        return next;
      });
    }
  };

  const handleColDragEnd = () => {
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  // ── Upload JSON data as file and return URL ───────────────────────────────
  const uploadDataAsFile = async (data) => {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const file = new File([blob], "assignments_backup.json", { type: "application/json" });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  // ── CSV Import — parse, validate, preview, then write ───────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    // 建立匯入前版本
    try {
      const user = await base44.auth.me();
      const now = new Date().toISOString();
      const versionId = `before_${Date.now()}`;
      const fileUrl = await uploadDataAsFile(assignments);
      await base44.entities.AssignmentCSVVersion.create({
        version_id: versionId,
        created_at: now,
        created_by: user?.email || "admin",
        description: "import_before",
        record_count: assignments.length,
        data: fileUrl,
        notes: `匯入前自動備份（${assignments.length} 筆）`,
      });
      console.log("[Import] 建立匯入前版本:", versionId);
    } catch (err) {
      console.error("[Import] 建立備份版本失敗:", err);
    }

    const text = await file.text();
    const rows = parseCSV(text);
    console.log("[Import] Total raw rows:", rows.length);

    const headerIdx = findHeaderRow(rows);
    const headers = rows[headerIdx].map(h => h.trim());
    console.log("[Import] Header row index:", headerIdx, "Headers:", headers);

    // Check required columns exist
    const missingCols = ["assignment_id", "week_number", "task_number"].filter(c => !headers.includes(c));
    if (missingCols.length > 0) {
      setImportPreview({ fatalError: `缺少必要欄位：${missingCols.join("、")}`, valid: [], skipped: [] });
      return;
    }

    const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c.trim()));
    const expectedColCount = headers.length;

    // ── 預檢查：欄數與行數分析 ─────────────────────────────────────────
    const inconsistentRows = dataRows.filter(r => r.length !== expectedColCount);
    const colCountOk = inconsistentRows.length === 0;
    const rowCountOk = headerIdx === 0; // 若 headerIdx > 0 代表有多餘標題列
    const preCheck = {
      expectedColCount,
      actualRowCount: dataRows.length,
      inconsistentRowCount: inconsistentRows.length,
      inconsistentSamples: inconsistentRows.slice(0, 3).map((r, i) => ({
        lineNum: headerIdx + 2 + dataRows.indexOf(r),
        actualCols: r.length,
      })),
      extraHeaderRows: headerIdx, // 跳過的標題前置行數
      colCountOk,
      rowCountOk,
    };

    const valid = [];
    const skipped = [];
    const seenAids = new Set(); // duplicate check within the file

    dataRows.forEach((row, idx) => {
      const lineNum = headerIdx + 2 + idx;
      const errors = [];

      // ── 欄位數一致性 ──
      if (row.length !== expectedColCount) {
        errors.push(`欄位數不一致（預期 ${expectedColCount}，實際 ${row.length}）`);
        skipped.push({ lineNum, aid: "(無法解析)", errors });
        console.warn(`[Import] Row ${lineNum}: ❌ 欄位數錯誤`, row);
        return;
      }

      const rec = {};
      headers.forEach((h, i) => { rec[h] = row[i] ?? ""; });

      // ── assignment_id ──
      const aid = rec.assignment_id?.trim();
      if (!aid) errors.push("assignment_id 不可為空");
      else if (aid === "0") errors.push("assignment_id 不可為 0");
      else if (seenAids.has(aid)) errors.push(`assignment_id 重複：${aid}`);
      if (aid) seenAids.add(aid);

      // ── week_number ──
      const wnRaw = rec.week_number?.trim();
      const wn = Number(wnRaw);
      if (!wnRaw || !Number.isInteger(wn) || wn <= 0) errors.push(`week_number 無效 (值="${wnRaw}")`);

      // ── task_number ──
      const tnRaw = rec.task_number?.trim();
      const tn = Number(tnRaw);
      if (!tnRaw || !Number.isInteger(tn) || tn <= 0) errors.push(`task_number 無效 (值="${tnRaw}")`);

      // ── allow_ai / is_open: must be parseable bool ──
      const BOOL_VALS = new Set(["true","false","1","0","yes","no",""]);
      if (!BOOL_VALS.has(rec.allow_ai?.trim().toLowerCase())) errors.push(`allow_ai 非布林值 (值="${rec.allow_ai}")`);
      if (!BOOL_VALS.has(rec.is_open?.trim().toLowerCase())) errors.push(`is_open 非布林值 (值="${rec.is_open}")`);

      // ── rubric: if present must be valid JSON (or plain text — skip strict JSON check here, just log) ──
      // rubric is free-text in this app, no JSON enforcement needed

      console.log(`[Import] Row ${lineNum}: assignment_id="${aid}" week=${wnRaw} task=${tnRaw}`, errors.length ? "❌" + errors.join(", ") : "✓");

      if (errors.length > 0) {
        skipped.push({ lineNum, aid: aid || "(空)", errors });
      } else {
        const payload = {};
        // Map all known entity fields from the CSV — use schema cols if available, else fallback
        const ALL_ENTITY_COLS = exportCols.map(c => c.col);
        ALL_ENTITY_COLS.forEach(col => { payload[col] = rec[col] ?? ""; });
        payload.week_number = wn;
        payload.task_number = tn;
        payload.allow_ai = parseBool(rec.allow_ai);
        payload.is_open = parseBool(rec.is_open);

        // Final safety gate — never write week=0 or task=0
        if (payload.week_number === 0 || payload.task_number === 0) {
          skipped.push({ lineNum, aid: aid || "(空)", errors: ["安全阻擋：week/task 為 0"] });
          return;
        }

        // ── 逐格比對資料庫內容，無變化則標記 unchanged ──
        const existing = assignments.find(a => a.assignment_id === aid);
        let diffAction = "new";
        if (existing) {
          const COMPARE_COLS = exportCols.map(c => c.col).filter(c => c !== "assignment_id");
          const hasChange = COMPARE_COLS.some(col => {
            const dbVal = String(existing[col] ?? "");
            const csvVal = col === "allow_ai"
              ? String(parseBool(rec[col]))
              : col === "is_open"
                ? String(parseBool(rec[col]))
                : col === "week_number"
                  ? String(wn)
                  : col === "task_number"
                    ? String(tn)
                    : String(rec[col] ?? "");
            return dbVal !== csvVal;
          });
          diffAction = hasChange ? "updated" : "unchanged";
        }

        valid.push({ lineNum, aid, payload, diffAction });
      }
    });

    console.log("[Import] Valid:", valid.length, "Skipped:", skipped.length);
    setImportChecks({ colCount: colCountOk, rowCount: rowCountOk, content: false });
    setImportPreview({ valid, skipped, fatalError: null, importMode: "upsert", preCheck });
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setImporting(true);
    const { valid, importMode } = importPreview;

    // Full-overwrite mode: delete all first
    if (importMode === "overwrite") {
      const allIds = assignments.map(a => a.id);
      for (const id of allIds) {
        await base44.entities.Assignment.delete(id);
        await new Promise(r => setTimeout(r, 80));
      }
    }

    let created = 0, updated = 0, failed = 0, unchanged = 0;
    const errors = [];

    // Re-fetch after potential delete
    const currentAssignments = importMode === "overwrite" ? [] : assignments;

    for (const item of valid) {
      // Safety gate before write
      if (!item.aid || item.aid === "0" || item.payload.week_number <= 0 || item.payload.task_number <= 0) {
        failed++;
        errors.push({ lineNum: item.lineNum, aid: item.aid, reason: "安全阻擋：無效 ID 或 week/task=0" });
        console.error("[Import] BLOCKED write for", item);
        continue;
      }
      const existing = currentAssignments.find(a => a.assignment_id === item.aid);
      // Skip unchanged records (upsert mode only — overwrite always writes)
      if (importMode === "upsert" && item.diffAction === "unchanged") {
        unchanged++;
        continue;
      }
      try {
        if (existing && importMode !== "overwrite") {
          await base44.entities.Assignment.update(existing.id, item.payload);
          updated++;
        } else {
          await base44.entities.Assignment.create(item.payload);
          created++;
        }
      } catch (err) {
        failed++;
        errors.push({ lineNum: item.lineNum, aid: item.aid, reason: err.message });
        console.error("[Import] Write failed for", item.aid, err);
      }
      await new Promise(r => setTimeout(r, 120));
    }

    await load();
    setImporting(false);
    setImportPreview(null);
    setImportReport({ created, updated, failed, unchanged, errors, total: valid.length });

    // 建立匯入後版本
    try {
      const user = await base44.auth.me();
      const updatedAssignments = await base44.entities.Assignment.list();
      const versionId = `after_${Date.now()}`;
      const fileUrl = await uploadDataAsFile(updatedAssignments);
      await base44.entities.AssignmentCSVVersion.create({
        version_id: versionId,
        created_at: new Date().toISOString(),
        created_by: user?.email || "admin",
        description: "import_after",
        record_count: updatedAssignments.length,
        data: fileUrl,
        notes: `匯入完成（新增 ${created}、更新 ${updated}、無變化略過 ${unchanged}、失敗 ${failed}）`,
      });
      console.log("[Import] 建立匯入後版本:", versionId);
    } catch (err) {
      console.error("[Import] 建立匯入後版本失敗:", err);
    }
  };

  const initialForm = editing && editing !== "new"
    ? { ...EMPTY_FORM, ...editing }
    : EMPTY_FORM;

  const glass = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
    borderRadius: "16px",
  };
  const glassModal = {
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    border: "1px solid rgba(255,255,255,0.92)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
    borderRadius: "20px",
  };

  return (
    <div className="min-h-screen p-4" style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #f7f5ff 40%, #f0f9ff 100%)" }}>
      {/* Ambient blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "40%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "30%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>
      <div className="max-w-7xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="p-5 mb-4" style={glass}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <a href="/TeacherDashboard" className="text-sm inline-block mb-1 transition hover:opacity-60" style={{ color: "#6e6e73" }}>← 返回教師看板</a>
              <h1 className="text-xl font-bold" style={{ color: "#1d1d1f", letterSpacing: "-0.3px" }}>Assignment 管理</h1>
              <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>管理每週課堂範例與作業內容</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "🖼️ 圖片管理", onClick: () => navigate("/AssignmentEditor"), color: "rgba(0,0,0,0.05)", textColor: "#3a3a3c" },
                { label: "↓ 匯出 CSV", onClick: () => setExportModalOpen(true), color: "rgba(52,199,89,0.1)", textColor: "#1a7f37" },
                { label: "📋 CSV版本管理", onClick: () => setVersionManagerOpen(true), color: "rgba(175,82,222,0.1)", textColor: "#8e44ad" },
                { label: "↑ 匯入 CSV", onClick: () => importRef.current?.click(), color: "rgba(0,122,255,0.09)", textColor: "#0071e3" },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick} className="px-3 py-2 text-sm font-medium transition" style={{ background: btn.color, border: "1px solid rgba(255,255,255,0.7)", borderRadius: "10px", color: btn.textColor, backdropFilter: "blur(8px)" }}>
                  {btn.label}
                </button>
              ))}
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
              <button onClick={() => setEditing("new")} className="px-3 py-2 text-sm font-semibold transition" style={{ background: "rgba(0,122,255,0.9)", color: "#fff", border: "1px solid transparent", borderRadius: "10px" }}>
                + 新增作業
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-4 pt-4 flex-wrap" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            {[
              { key: "assignments", label: "📋 作業管理", activeColor: "rgba(0,122,255,0.9)" },
              { key: "batch_open", label: "🏫 班級批次開放", activeColor: "rgba(52,199,89,0.9)" },
              { key: "unlock", label: "🔓 任務解鎖", activeColor: "rgba(255,149,0,0.9)" },
              { key: "pretest_unlock", label: "📋 前測解鎖", activeColor: "rgba(50,173,230,0.9)" },
              { key: "posttest_unlock", label: "📝 後測解鎖", activeColor: "rgba(88,86,214,0.9)" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-1.5 text-sm font-medium transition"
                style={tab === t.key
                  ? { background: t.activeColor, color: "#fff", borderRadius: "10px", border: "1px solid transparent" }
                  : { background: "rgba(0,0,0,0.05)", color: "#3a3a3c", borderRadius: "10px", border: "1px solid transparent" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CSV Export Settings Modal */}
        {exportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-3xl flex flex-col" style={{ ...glassModal, maxHeight: "80vh" }}>
              <div className="p-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                <h2 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>CSV 匯出設定</h2>
                <p className="text-xs mt-1" style={{ color: "#6e6e73" }}>拖曳欄位卡片以調整匯出順序（左→右），勾選決定是否匯出。共 {exportCols.filter(c => c.enabled).length} 個欄位將被匯出。</p>
              </div>

              {/* Horizontal drag zone */}
              <div className="p-4 flex-1 overflow-y-auto" style={{ maxHeight: "55vh" }}>
                <div className="flex flex-row flex-wrap gap-1.5">
                  {exportCols.map((item, idx) => (
                    <div
                      key={item.col}
                      draggable
                      onDragStart={(e) => handleColDragStart(e, idx)}
                      onDragOver={(e) => handleColDragOver(e, idx)}
                      onDragEnd={handleColDragEnd}
                      style={{ width: "120px", flexShrink: 0 }}
                      className={`
                        relative select-none rounded-lg border-2 px-2 py-2 cursor-grab active:cursor-grabbing transition-all
                        ${item.enabled
                          ? "bg-blue-50 border-blue-300 hover:border-blue-400 hover:shadow-sm"
                          : "bg-gray-50 border-gray-200 opacity-40 hover:opacity-60"}
                      `}
                    >
                      {/* Drag handle + index on same row */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-300 text-[10px] leading-none select-none">⠿⠿</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${item.enabled ? "bg-blue-100 text-blue-500" : "bg-gray-100 text-gray-400"}`}>
                          #{idx + 1}
                        </span>
                      </div>

                      {/* Column name + label */}
                      <p className={`text-[10px] font-mono font-bold text-center break-all leading-tight ${item.enabled ? "text-blue-800" : "text-gray-400"}`}>
                        {item.col}
                      </p>
                      <p className={`text-[9px] text-center mb-1.5 ${item.enabled ? "text-blue-500" : "text-gray-300"}`}>
                        {item.label || ""}
                      </p>

                      {/* Left/Right move buttons */}
                      <div className="flex gap-1 mb-1.5 justify-center" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx > 0) {
                              setExportCols(prev => {
                                const next = [...prev];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                return next;
                              });
                            }
                          }}
                          disabled={idx === 0}
                          className="w-5 h-5 rounded text-[10px] flex items-center justify-center border transition bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed border-gray-300"
                          title="向左移動"
                        >
                          ◀
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (idx < exportCols.length - 1) {
                              setExportCols(prev => {
                                const next = [...prev];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                return next;
                              });
                            }
                          }}
                          disabled={idx === exportCols.length - 1}
                          className="w-5 h-5 rounded text-[10px] flex items-center justify-center border transition bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed border-gray-300"
                          title="向右移動"
                        >
                          ▶
                        </button>
                      </div>

                      {/* Checkbox */}
                      <div
                        className="flex items-center justify-center gap-1 cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExportCols(prev => prev.map((c, i) =>
                            i === idx ? { ...c, enabled: !c.enabled } : c
                          ));
                        }}
                      >
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition ${item.enabled ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300"}`}>
                          {item.enabled && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-[9px] text-gray-400 select-none">{item.enabled ? "匯出" : "略過"}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Preview of column order */}
                <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#6e6e73" }}>CSV 標題列預覽：</p>
                  <p className="text-xs font-mono break-all" style={{ color: "#3a3a3c" }}>
                    {exportCols.filter(c => c.enabled).map(c => c.col).join(", ")}
                  </p>
                </div>
              </div>

              <div className="p-5 flex gap-2 items-center" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <button
                  onClick={() => setExportCols(FALLBACK_CSV_COLS.map(col => ({ col, enabled: true, label: col })))}
                  className="px-3 py-2 text-xs transition" style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px", color: "#6e6e73", background: "rgba(0,0,0,0.04)" }}
                >
                  重置順序
                </button>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setExportModalOpen(false)} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c", borderRadius: "10px" }}>取消</button>
                  <button
                    onClick={handleExport}
                    disabled={exportCols.filter(c => c.enabled).length === 0}
                    className="px-4 py-2 text-sm font-semibold disabled:opacity-50 transition"
                    style={{ background: "rgba(52,199,89,0.9)", color: "#fff", borderRadius: "10px" }}
                  >
                    ↓ 匯出 {exportCols.filter(c => c.enabled).length} 個欄位
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-sm p-6" style={glassModal}>
              <h2 className="text-base font-bold mb-2" style={{ color: "#1d1d1f" }}>確認刪除</h2>
              <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>確定要刪除這筆作業嗎？此操作無法復原。</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c", borderRadius: "10px" }}>取消</button>
                <button onClick={confirmDelete} className="px-4 py-2 text-sm font-semibold transition" style={{ background: "rgba(255,59,48,0.9)", color: "#fff", borderRadius: "10px" }}>確認刪除</button>
              </div>
            </div>
          </div>
        )}

        {/* Import Preview Modal */}
        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col" style={glassModal}>
              <div className="p-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                <h2 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>匯入預覽</h2>
                {importPreview.fatalError ? (
                  <p className="mt-2 text-sm text-red-600 font-semibold">⛔ {importPreview.fatalError}</p>
                ) : (
                  <>
                    {/* ── 預檢查結果 ── */}
                    {importPreview.preCheck && (
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">📋 匯入前檢查項目</p>

                        {/* 欄數檢查 */}
                        <div className={`flex items-start gap-2 text-xs p-2 rounded-lg border ${importPreview.preCheck.colCountOk ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-300"}`}>
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={importChecks.colCount}
                              onChange={e => setImportChecks(c => ({ ...c, colCount: e.target.checked }))}
                              className="w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <span>
                              <span className="font-semibold">欄數一致</span>
                              {importPreview.preCheck.colCountOk
                                ? <span className="text-green-600 ml-1">✓ 所有列欄數均為 {importPreview.preCheck.expectedColCount}</span>
                                : <span className="text-amber-700 ml-1">⚠️ 有 {importPreview.preCheck.inconsistentRowCount} 列欄數不一致（標準欄數：{importPreview.preCheck.expectedColCount}）。可能原因：儲存格內換行或格式錯誤。</span>
                              }
                            </span>
                          </label>
                        </div>

                        {/* 行數/標題列檢查 */}
                        <div className={`flex items-start gap-2 text-xs p-2 rounded-lg border ${importPreview.preCheck.rowCountOk ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-300"}`}>
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={importChecks.rowCount}
                              onChange={e => setImportChecks(c => ({ ...c, rowCount: e.target.checked }))}
                              className="w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <span>
                              <span className="font-semibold">標題列位置</span>
                              {importPreview.preCheck.rowCountOk
                                ? <span className="text-green-600 ml-1">✓ 標題列在第 1 列，共 {importPreview.preCheck.actualRowCount} 筆資料</span>
                                : <span className="text-amber-700 ml-1">⚠️ 標題列偵測在第 {importPreview.preCheck.extraHeaderRows + 1} 列，前方有 {importPreview.preCheck.extraHeaderRows} 列被略過（可能為附加的說明列）。請確認第一列前無多餘內容。</span>
                              }
                            </span>
                          </label>
                        </div>

                        {/* 內容確認 */}
                        <div className="flex items-start gap-2 text-xs p-2 rounded-lg border bg-blue-50 border-blue-200">
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={importChecks.content}
                              onChange={e => setImportChecks(c => ({ ...c, content: e.target.checked }))}
                              className="w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <span>
                              <span className="font-semibold">內容已確認</span>
                              <span className="text-blue-700 ml-1">我已檢查下方將匯入的資料內容（{importPreview.valid.length} 筆可匯入，{importPreview.skipped.length} 筆跳過），確認無誤。</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-3 text-sm items-center">
                      <span className="text-blue-600 font-semibold">新增：{importPreview.valid.filter(v => v.diffAction === "new").length} 筆</span>
                      <span className="text-orange-500 font-semibold">更新：{importPreview.valid.filter(v => v.diffAction === "updated").length} 筆</span>
                      <span className="text-gray-400 font-semibold">無變化：{importPreview.valid.filter(v => v.diffAction === "unchanged").length} 筆</span>
                      <span className="text-red-500 font-semibold">✗ 跳過：{importPreview.skipped.length} 筆</span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-gray-500">匯入策略：</span>
                        <button
                          onClick={() => setImportPreview(p => ({ ...p, importMode: "upsert" }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${importPreview.importMode === "upsert" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                        >Upsert（新增+覆蓋）</button>
                        <button
                          onClick={() => setImportPreview(p => ({ ...p, importMode: "overwrite" }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${importPreview.importMode === "overwrite" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                        >全覆蓋（清空再寫入）</button>
                      </div>
                    </div>
                    {importPreview.importMode === "overwrite" && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                        ⚠️ 全覆蓋模式：匯入前將刪除資料庫中所有 {assignments.length} 筆 Assignment，請謹慎！
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {!importPreview.fatalError && importPreview.valid.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-green-700 uppercase mb-2">資料列表</p>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {importPreview.valid.map((item) => {
                        const isOverwrite = importPreview.importMode === "overwrite";
                        const actionLabel = isOverwrite
                          ? <span className="ml-auto text-purple-500 font-medium">[寫入]</span>
                          : item.diffAction === "new"
                            ? <span className="ml-auto text-blue-500 font-medium">[新增]</span>
                            : item.diffAction === "updated"
                              ? <span className="ml-auto text-orange-500 font-medium">[更新]</span>
                              : <span className="ml-auto text-gray-400 font-medium">[無變化，略過]</span>;
                        const rowBg = isOverwrite
                          ? "bg-purple-50 border-purple-200"
                          : item.diffAction === "new"
                            ? "bg-blue-50 border-blue-200"
                            : item.diffAction === "updated"
                              ? "bg-orange-50 border-orange-200"
                              : "bg-gray-50 border-gray-200 opacity-60";
                        return (
                          <div key={item.aid} className={`text-xs rounded px-3 py-1.5 flex items-center gap-2 border ${rowBg}`}>
                            <span className="font-mono font-semibold w-24 truncate">{item.aid}</span>
                            <span className="text-gray-500">第 {item.payload.week_number} 週 T{item.payload.task_number}</span>
                            {actionLabel}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {importPreview.skipped.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase mb-2">跳過的列（驗證失敗，不寫入）</p>
                    <div className="space-y-1">
                      {importPreview.skipped.map((item, i) => (
                        <div key={i} className="text-xs bg-red-50 border border-red-200 rounded px-3 py-1.5">
                          <span className="font-mono text-gray-500 mr-2">第 {item.lineNum} 列</span>
                          <span className="font-semibold text-gray-700 mr-2">{item.aid}</span>
                          <span className="text-red-600">{item.errors.join("、")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 flex gap-2 justify-end items-center" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                {!importPreview.fatalError && (!importChecks.colCount || !importChecks.rowCount || !importChecks.content) ? (
                  <p className="text-xs mr-auto" style={{ color: "#aeaeb2" }}>請先勾選所有檢查項目後才能匯入</p>
                ) : null}
                <button onClick={() => { setImportPreview(null); setImportChecks({ colCount: false, rowCount: false, content: false }); }} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c", borderRadius: "10px" }}>取消</button>
                {!importPreview.fatalError && (
                  <button
                    onClick={handleImportConfirm}
                    disabled={importing || importPreview.valid.length === 0 || !importChecks.colCount || !importChecks.rowCount || !importChecks.content}
                    className="px-4 py-2 text-sm font-semibold disabled:opacity-50 transition"
                    style={{ background: importPreview.importMode === "overwrite" ? "rgba(255,59,48,0.9)" : "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }}
                  >
                    {importing ? "匯入中…" : importPreview.importMode === "overwrite"
                      ? `⚠️ 清空並匯入 ${importPreview.valid.length} 筆`
                      : `確認匯入（新增 ${importPreview.valid.filter(v => v.diffAction === "new").length} + 更新 ${importPreview.valid.filter(v => v.diffAction === "updated").length}）`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Import Report Modal */}
        {importReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-lg max-h-[80vh] flex flex-col" style={glassModal}>
              <div className="p-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                <h2 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>匯入報告</h2>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[
                    { val: importReport.created, label: "新增", color: "#34c759" },
                    { val: importReport.updated, label: "更新", color: "#ff9500" },
                    { val: importReport.unchanged ?? 0, label: "無變化略過", color: "#8e8e93" },
                    { val: importReport.failed, label: "失敗", color: "#ff3b30" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3" style={{ background: `${s.color}12`, border: `1px solid ${s.color}30` }}>
                      <p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
                      <p className="text-xs mt-0.5" style={{ color: s.color }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {importReport.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase mb-2" style={{ color: "#ff3b30" }}>失敗明細</p>
                    <div className="space-y-1">
                      {importReport.errors.map((e, i) => (
                        <div key={i} className="text-xs rounded px-3 py-1.5" style={{ background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.2)" }}>
                          <span className="font-mono mr-2" style={{ color: "#6e6e73" }}>第 {e.lineNum} 列</span>
                          <span className="font-semibold mr-2" style={{ color: "#1d1d1f" }}>{e.aid}</span>
                          <span style={{ color: "#ff3b30" }}>{e.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 flex justify-end" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <button onClick={() => setImportReport(null)} className="px-4 py-2 text-sm font-semibold transition" style={{ background: "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }}>關閉</button>
              </div>
            </div>
          </div>
        )}

        {tab === "batch_open" && <AssignmentBatchOpenPanel assignments={assignments} />}
        {tab === "unlock" && <AttemptUnlockPanel assignments={assignments} />}
        {tab === "pretest_unlock" && <PretestUnlockPanel sourcePage="AssignmentManager" />}
        {tab === "posttest_unlock" && <PosttestUnlockPanel sourcePage="AssignmentManager" />}

        {tab === "assignments" && <div className="flex gap-4">
          {/* Left: list */}
          <div className="flex-1 min-w-0">
            {/* Filters */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}
                className="px-3 py-1.5 text-sm focus:outline-none"
                style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "10px", color: "#1d1d1f" }}>
                <option value="all">所有週次</option>
                {weeks.map((w) => <option key={w} value={String(w)}>第 {w} 週</option>)}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋標題或 ID…"
                className="flex-1 px-3 py-1.5 text-sm focus:outline-none"
                style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "10px", color: "#1d1d1f" }} />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.length === 0 && (
                  <div className="p-8 text-center" style={{ ...glass, color: "#aeaeb2" }}>沒有符合的作業</div>
                )}
                {filtered.map((a) => (
                  <div key={a.id}
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer transition"
                    style={{
                      ...glass,
                      boxShadow: editing?.id === a.id
                        ? "0 0 0 2px rgba(0,122,255,0.5), 0 2px 16px rgba(0,0,0,0.06)"
                        : "0 2px 8px rgba(0,0,0,0.05)",
                    }}
                    onClick={() => setEditing(a)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,122,255,0.1)" }}>
                        <span className="text-sm font-bold" style={{ color: "#0071e3" }}>T{a.task_number}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs" style={{ color: "#aeaeb2" }}>{a.assignment_id} · 第 {a.week_number} 週</p>
                        <p className="text-sm font-semibold truncate" style={{ color: "#1d1d1f" }}>{a.title || `任務 ${a.task_number}`}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {a.prompt_text && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3" }}>作業</span>}
                          {a.example_code && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad" }}>範例</span>}
                          {a.example_image_url && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "rgba(255,45,85,0.1)", color: "#e0185a" }}>範例圖</span>}
                          {a.assignment_image_url && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "rgba(255,149,0,0.1)", color: "#c75000" }}>作業圖</span>}
                          {a.hint_text && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "rgba(255,204,0,0.15)", color: "#9d6800" }}>提示</span>}
                          <span className="text-[10px] rounded px-1.5 py-0.5" style={a.allow_ai ? { background: "rgba(52,199,89,0.1)", color: "#1a7f37" } : { background: "rgba(255,59,48,0.1)", color: "#d70015" }}>
                            {a.allow_ai ? "AI ✓" : "AI ✗"}
                          </span>
                          <span className="text-[10px] rounded px-1.5 py-0.5" style={(a.question_type || "CodeProblem") === "ConceptProblem" ? { background: "rgba(255,149,0,0.1)", color: "#c75000" } : { background: "rgba(0,122,255,0.1)", color: "#0071e3" }}>
                            {QUESTION_TYPE_LABELS[a.question_type] || "程式題"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={async () => {
                          const newVal = !a.is_open;
                          await base44.entities.Assignment.update(a.id, { is_open: newVal });
                          setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, is_open: newVal } : x));
                        }}
                        className="text-xs px-3 py-1.5 font-semibold transition whitespace-nowrap"
                        style={a.is_open
                          ? { background: "rgba(52,199,89,0.12)", color: "#1a7f37", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "8px" }
                          : { background: "rgba(0,0,0,0.06)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px" }}
                      >
                        {a.is_open ? "🟢 全域開放" : "🔒 全域關閉"}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="text-xs px-2 py-1 transition"
                        style={{ color: "#ff3b30", borderRadius: "6px" }}
                      >刪除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: form panel */}
          {editing && (
            <div className="w-[800px] flex-shrink-0">
              <div className="p-5 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto" style={glass}>
                <h2 className="text-base font-bold mb-4" style={{ color: "#1d1d1f" }}>
                  {editing === "new" ? "新增作業" : `編輯：${editing.assignment_id}`}
                </h2>
                <AssignmentForm
                  key={editing === "new" ? "new" : editing.id}
                  initial={editing === "new" ? EMPTY_FORM : { ...EMPTY_FORM, ...editing }}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                  onPreview={openLightbox}
                />
                {saving && <p className="text-xs mt-2 text-center" style={{ color: "#0071e3" }}>儲存中…</p>}
              </div>
            </div>
          )}
        </div>}

        {/* Lightbox */}
        {lightbox && lightbox.images.length > 0 && (
          <div
            className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center"
            onClick={closeLightbox}
          >
            {lightbox.images.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length })); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white text-xl flex items-center justify-center transition z-10"
              >‹</button>
            )}
            <div className="flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
              <img
                src={lightbox.images[lightbox.index]}
                alt="放大檢視"
                className="max-w-[85vw] max-h-[80vh] rounded-xl shadow-2xl object-contain"
              />
              {lightbox.images.length > 1 && (
                <div className="flex gap-1.5">
                  {lightbox.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(l => ({ ...l, index: i }))}
                      className={`w-2 h-2 rounded-full transition ${i === lightbox.index ? "bg-white" : "bg-white/40 hover:bg-white/70"}`}
                    />
                  ))}
                </div>
              )}
            </div>
            {lightbox.images.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.images.length })); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white text-xl flex items-center justify-center transition z-10"
              >›</button>
            )}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white text-3xl font-bold leading-none hover:opacity-70 z-10"
            >✕</button>
          </div>
        )}

        {/* CSV 版本管理 Modal */}
        <CSVVersionManager
          isOpen={versionManagerOpen}
          onClose={() => setVersionManagerOpen(false)}
          assignments={assignments}
          onRestore={load}
        />
      </div>
    </div>
  );

}

export default function AssignmentManager() {
  return (
    <TeacherAuthGuard>
      <AssignmentManagerInner />
    </TeacherAuthGuard>
  );
}