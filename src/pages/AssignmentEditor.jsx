import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";

export default function AssignmentEditor() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState({ example: false, assignment: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.Assignment.list("-week_number", 100).then(data => {
      data.sort((a, b) => a.week_number - b.week_number || a.task_number - b.task_number);
      setAssignments(data);
    });
  }, []);

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      example_image_url: a.example_image_url || "",
      assignment_image_url: a.assignment_image_url || "",
    });
    setSaved(false);
  };

  const handleUpload = async (file, field) => {
    const key = field === "example_image_url" ? "example" : "assignment";
    setUploading(u => ({ ...u, [key]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, [field]: file_url }));
    setUploading(u => ({ ...u, [key]: false }));
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    await base44.entities.Assignment.update(editing.id, {
      example_image_url: form.example_image_url || null,
      assignment_image_url: form.assignment_image_url || null,
    });
    setAssignments(prev => prev.map(a => a.id === editing.id ? { ...a, ...form } : a));
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Assignment 圖片管理</h1>
            <p className="text-sm text-gray-500 mt-1">點選任務以上傳範例圖片或作業圖片</p>
          </div>
          <button
            onClick={() => navigate("/AssignmentManager")}
            className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 transition whitespace-nowrap"
          >
            ← 返回任務管理
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Assignment list */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">選擇任務</p>
            </div>
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {assignments.map(a => (
                <button
                  key={a.id}
                  onClick={() => openEdit(a)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition flex items-center justify-between ${editing?.id === a.id ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                >
                  <div>
                    <span className="font-medium text-gray-800">W{a.week_number} T{a.task_number}</span>
                    <span className="text-gray-500 ml-2">{a.title}</span>
                  </div>
                  {(a.example_image_url || a.assignment_image_url) && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">有圖片</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Edit panel */}
          {editing ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
              <div>
                <p className="text-base font-bold text-gray-900">W{editing.week_number} T{editing.task_number} — {editing.title}</p>
              </div>

              <ImageUploadField
                label="課堂範例圖片"
                fieldKey="example_image_url"
                value={form.example_image_url}
                uploading={uploading.example}
                onChange={v => setForm(f => ({ ...f, example_image_url: v }))}
                onUpload={file => handleUpload(file, "example_image_url")}
              />

              <ImageUploadField
                label="作業圖片"
                fieldKey="assignment_image_url"
                value={form.assignment_image_url}
                uploading={uploading.assignment}
                onChange={v => setForm(f => ({ ...f, assignment_image_url: v }))}
                onUpload={file => handleUpload(file, "assignment_image_url")}
              />

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存"}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 flex items-center justify-center">
              <p className="text-sm text-gray-400">← 請從左側選擇一個任務</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageUploadField({ label, value, uploading, onChange, onUpload }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>

      {/* Upload button */}
      <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer transition text-sm ${uploading ? "border-blue-300 bg-blue-50 text-blue-500" : "border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-500"}`}>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={e => e.target.files[0] && onUpload(e.target.files[0])}
        />
        {uploading ? "上傳中…" : "點擊上傳圖片"}
      </label>

      {/* URL preview / manual input */}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="或直接貼上圖片網址"
        className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {value && (
        <div className="mt-2">
          <div className="relative">
            <img src={value} alt="preview" className="w-full max-h-40 object-contain rounded-lg border border-gray-200 bg-gray-50" />
          </div>
          <button
            onClick={() => onChange("")}
            className="mt-1 w-full py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition font-medium"
          >
            🗑 刪除截圖
          </button>
        </div>
      )}
    </div>
  );
}