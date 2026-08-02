import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

function AsyncVersionPreview({ version, fetchVersionData }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVersionData(version)
      .then(setData)
      .catch(() => setError("預覽失敗"));
  }, [version.id]);

  if (error) return <p className="text-red-500 text-xs">{error}</p>;
  if (!data) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3 text-xs">
          <div className="flex gap-2 items-center mb-1">
            <span className="font-mono font-bold text-blue-600">{item.assignment_id}</span>
            <span className="text-gray-500">{item.title}</span>
          </div>
          <p className="text-gray-400 line-clamp-1">{item.prompt_text}</p>
        </div>
      ))}
    </div>
  );
}

export default function CSVVersionManager({ isOpen, onClose, assignments, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [manualBackingUp, setManualBackingUp] = useState(false);
  const [editingNotes, setEditingNotes] = useState(null); // { id, notes }
  const [savingNotes, setSavingNotes] = useState(false);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.AssignmentCSVVersion.list("-created_at", 100);
      setVersions(data);
    } catch (e) {
      console.error("載入版本失敗:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadVersions();
  }, [isOpen]);

  const fetchVersionData = async (version) => {
    if (version.data && version.data.startsWith("http")) {
      const res = await fetch(version.data);
      return await res.json();
    }
    return JSON.parse(version.data);
  };

  const uploadDataAsFile = async (data) => {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const file = new File([blob], "assignments_backup.json", { type: "application/json" });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleRestore = async (version) => {
    setRestoring(version.id);
    try {
      const user = await base44.auth.me();
      const snapshotData = await fetchVersionData(version);

      for (const a of assignments) {
        await base44.entities.Assignment.delete(a.id);
        await new Promise(r => setTimeout(r, 100));
      }

      let restored = 0;
      for (let i = 0; i < snapshotData.length; i++) {
        const item = snapshotData[i];
        try {
          const { id, created_date, updated_date, created_by, ...cleanData } = item;
          await base44.entities.Assignment.create(cleanData);
          restored++;
        } catch (err) {
          console.error(`還原第 ${i + 1} 筆失敗:`, err);
        }
        await new Promise(r => setTimeout(r, 100));
      }

      const restoreFileUrl = await uploadDataAsFile(snapshotData);
      await base44.entities.AssignmentCSVVersion.create({
        version_id: `restore_${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: user?.email || "admin",
        description: "manual",
        record_count: restored,
        data: restoreFileUrl,
        notes: `還原自版本 ${version.version_id}（${version.record_count} 筆）`,
      });

      setConfirmRestore(null);
      alert(`✅ 成功還原 ${restored} 筆資料`);
      await onRestore();
      onClose();
    } catch (e) {
      console.error("還原失敗:", e);
      alert("還原失敗，請重試");
    } finally {
      setRestoring(null);
    }
  };

  const downloadCSV = async (version) => {
    const snapshotData = await fetchVersionData(version);
    const CSV_COLS = ["assignment_id","week_number","task_number","title","prompt_text","example_title","example_subtitle","example_code","example_image_url","assignment_image_url","hint_text","allow_ai","is_open","rubric","answer"];
    const escapeField = (v) => {
      const s = String(v ?? "");
      if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const csv = [CSV_COLS.join(","), ...snapshotData.map(a => CSV_COLS.map(k => escapeField(a[k] ?? "")).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assignments_v${version.version_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveNotes = async () => {
    if (!editingNotes) return;
    setSavingNotes(true);
    try {
      await base44.entities.AssignmentCSVVersion.update(editingNotes.id, { notes: editingNotes.notes });
      setVersions(prev => prev.map(v => v.id === editingNotes.id ? { ...v, notes: editingNotes.notes } : v));
      setEditingNotes(null);
    } catch (e) {
      alert("儲存失敗，請重試");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleManualBackup = async () => {
    setManualBackingUp(true);
    try {
      let userEmail = "admin";
      try { const user = await base44.auth.me(); userEmail = user?.email || "admin"; } catch {}
      const fileUrl = await uploadDataAsFile(assignments);
      await base44.entities.AssignmentCSVVersion.create({
        version_id: `manual_${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: userEmail,
        description: "manual",
        record_count: assignments.length,
        data: fileUrl,
        notes: `手動備份（${assignments.length} 筆）`,
      });
      await loadVersions();
    } catch (e) {
      console.error("手動備份失敗:", e?.message || e);
      alert(`備份失敗：${e?.message || "請重試"}`);
    } finally {
      setManualBackingUp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">CSV 版本管理</h2>
            <p className="text-xs text-gray-500 mt-1">共 {versions.length} 個版本</p>
          </div>
          <button
            onClick={handleManualBackup}
            disabled={manualBackingUp}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {manualBackingUp ? "備份中…" : "💾 手動備份"}
          </button>
        </div>

        {previewVersion ? (
          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">版本預覽</h3>
              <button
                onClick={() => setPreviewVersion(null)}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
              >
                ← 返回列表
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 rounded-lg border border-gray-200 p-4">
              <AsyncVersionPreview version={previewVersion} fetchVersionData={fetchVersionData} />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">尚無版本紀錄</div>
            ) : (
              <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">時間</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">類型</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">筆數</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">操作人</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-full">備註</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => {
                  const descLabel = {
                    import_before: "匯入前",
                    import_after: "匯入後",
                    manual: "手動/還原",
                  }[v.description] || v.description;

                  const isEditingThis = editingNotes?.id === v.id;

                  return (
                    <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-700 font-mono whitespace-nowrap">
                        {v.created_at ? new Date(v.created_at).toLocaleString("zh-TW") : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-medium text-white text-xs whitespace-nowrap ${
                          v.description === "import_before" ? "bg-amber-500" :
                          v.description === "import_after" ? "bg-green-500" :
                          "bg-blue-500"
                        }`}>
                          {descLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">{v.record_count || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{v.created_by?.split("@")[0] || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 min-w-[320px]">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingNotes.notes}
                              onChange={e => setEditingNotes({ ...editingNotes, notes: e.target.value })}
                              className="flex-1 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              autoFocus
                              onKeyDown={e => { if (e.key === "Enter") handleSaveNotes(); if (e.key === "Escape") setEditingNotes(null); }}
                            />
                            <button onClick={handleSaveNotes} disabled={savingNotes} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap">
                              {savingNotes ? "…" : "儲存"}
                            </button>
                            <button onClick={() => setEditingNotes(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition">
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 group">
                            <span className="truncate max-w-[400px]">{v.notes || "—"}</span>
                            <button
                              onClick={() => setEditingNotes({ id: v.id, notes: v.notes || "" })}
                              className="opacity-0 group-hover:opacity-100 ml-1 px-1 py-0.5 text-gray-400 hover:text-blue-500 transition text-[10px]"
                              title="編輯備註"
                            >✏️</button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setPreviewVersion(v)}
                            className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100 transition"
                            title="預覽版本"
                          >👁</button>
                          <button
                            onClick={() => setConfirmRestore(v)}
                            className="px-2 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-xs font-medium hover:bg-orange-100 transition"
                            title="還原至此版本"
                          >🔄</button>
                          <button
                            onClick={() => downloadCSV(v)}
                            className="px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-medium hover:bg-green-100 transition"
                            title="下載 CSV"
                          >📥</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            )}
          </div>
        )}

        <div className="p-5 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
            關閉
          </button>
        </div>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">確認還原版本</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              ⚠️ <strong>此操作會覆蓋目前所有作業資料</strong>，包括所有 assignment 的內容、圖片等。
              <br />學生的作業繳交、成績、批改紀錄、對話紀錄等相關資料不受影響。
            </div>
            <p className="text-xs text-gray-500 mb-4">
              還原時間：{confirmRestore.created_at ? new Date(confirmRestore.created_at).toLocaleString("zh-TW") : "—"}
              <br />還原筆數：{confirmRestore.record_count || "—"}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRestore(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                取消
              </button>
              <button
                onClick={() => handleRestore(confirmRestore)}
                disabled={restoring === confirmRestore.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
              >
                {restoring === confirmRestore.id ? "還原中…" : "確認還原"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}