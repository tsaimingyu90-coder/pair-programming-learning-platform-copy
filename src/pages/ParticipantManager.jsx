import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { findDuplicateParticipantIds, findInvalidParticipants, checkCsvDuplicates, checkCsvConflicts } from "@/utils/dataHealth";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

function ParticipantManagerInner() {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const importRef = useRef();
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Participant.list();
    data.sort((a, b) => a.participant_id.localeCompare(b.participant_id));
    setParticipants(data);
    setLoading(false);
  };

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await base44.functions.invoke("checkParticipantHealth", {});
      setHealthResult(res.data);
    } catch (err) {
      console.error("Health check failed:", err);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    load();
    checkHealth();
  }, []);

  const classes = [...new Set(participants.map(p => p.class_id).filter(Boolean))].sort();
  const groups = [...new Set(participants.map(p => p.group).filter(Boolean))].sort();

  const filtered = participants.filter(p => {
    const matchSearch = !search || 
      p.participant_id?.toLowerCase().includes(search.toLowerCase()) ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.student_id?.toLowerCase().includes(search.toLowerCase());
    const matchClass = filterClass === "all" || p.class_id === filterClass;
    const matchGroup = filterGroup === "all" || p.group === filterGroup;
    return matchSearch && matchClass && matchGroup;
  });

  // CSV Import with validation
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    
    const records = lines.slice(1).map(line => {
      const vals = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i]?.replace(/^"|"$/g, "") ?? ""; });
      return obj;
    });

    // Validation Step 1: Check duplicates within CSV
    const csvDuplicates = checkCsvDuplicates(records);
    if (csvDuplicates.hasDuplicates) {
      alert(`❌ 匯入失敗：CSV 內部有重複的 participant_id\n\n${csvDuplicates.duplicates.map(d => `• ${d.id}（${d.count} 次）`).join("\n")}\n\n請修正後再匯入`);
      e.target.value = "";
      return;
    }

    // Validation Step 2: Check conflicts with existing DB
    const conflicts = checkCsvConflicts(records, participants);
    if (conflicts.hasConflicts) {
      alert(`❌ 匯入失敗：以下 participant_id 已存在於資料庫中\n\n${conflicts.conflicts.slice(0, 10).map(c => `• ${c.participant_id}`).join("\n")}${conflicts.conflicts.length > 10 ? `\n... 還有 ${conflicts.conflicts.length - 10} 筆` : ""}\n\n請移除重複的 ID 後再匯入`);
      e.target.value = "";
      return;
    }

    // Validation Step 3: Check for invalid records
    const invalid = findInvalidParticipants(records);
    if (invalid.length > 0) {
      alert(`⚠️ 警告：CSV 中有 ${invalid.length} 筆資料缺少必要欄位\n\n${invalid.slice(0, 5).map(r => `• ${r.participant_id || "無 ID"} - ${r.name || "無姓名"}`).join("\n")}${invalid.length > 5 ? `\n... 還有 ${invalid.length - 5} 筆` : ""}\n\n將跳過這些記錄，繼續匯入？`);
    }

    if (!confirm(`即將匯入 ${records.length} 筆資料，確定繼續？`)) {
      e.target.value = "";
      return;
    }

    // Import valid records
    let successCount = 0;
    let skipCount = 0;
    
    for (const rec of records) {
      if (!rec.participant_id || !rec.name) {
        skipCount++;
        continue;
      }
      
      const payload = {
        participant_id: rec.participant_id.trim(),
        name: rec.name.trim(),
        student_id: rec.student_id?.trim() || "",
        password: rec.password?.trim() || "",
        class_id: rec.class_id?.trim() || "",
        gender: rec.gender?.trim() || "",
        years_experience: rec.years_experience ? Number(rec.years_experience) : 0,
        group: rec.group?.trim() || "AI_Pair",
        consent: rec.consent === "true" || rec.consent === true,
        created_at: new Date().toISOString(),
      };
      
      try {
        await base44.entities.Participant.create(payload);
        successCount++;
      } catch (err) {
        console.error("Failed to create participant:", err);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    await load();
    await checkHealth();
    e.target.value = "";
    alert(`✅ 匯入完成！\n成功：${successCount} 筆\n跳過：${skipCount} 筆`);
  };

  // CSV Export
  const handleExport = () => {
    const headers = ["participant_id", "name", "student_id", "password", "class_id", "gender", "years_experience", "group", "consent"];
    const rows = participants.map(p => 
      headers.map(h => {
        const v = p[h] ?? "";
        const str = String(v).replace(/"/g, '""');
        return `"${str}"`;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `participants_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id, participantId) => {
    if (!confirm(`確定刪除 ${participantId}？\n\n這將同時刪除所有相關紀錄（作答、聊天、問卷等）`)) return;
    
    try {
      // Call the delete function
      await base44.functions.invoke("deleteParticipantData", { participantId });
      await load();
      await checkHealth();
      alert(`✅ 已刪除 ${participantId} 及其所有資料`);
    } catch (err) {
      alert(`❌ 刪除失敗：${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Participant 管理</h1>
              <p className="text-sm text-gray-500 mt-0.5">管理參與者資料與健康檢查</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <a
                href={createPageUrl("ParticipantEditor")}
                className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm font-medium hover:bg-purple-100 transition flex items-center gap-2"
              >
                ✏️ 編輯資料
              </a>
              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  healthResult?.status === "warning" 
                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" 
                    : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                }`}
              >
                {healthLoading ? "🔍 檢查中..." : healthResult?.status === "warning" ? "⚠️ 異常" : "🔍 健康檢查"}
              </button>
              <button onClick={handleExport} className="px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition">
                ⬇ 匯出 CSV
              </button>
              <button onClick={() => importRef.current?.click()} className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition">
                ⬆ 匯入 CSV
              </button>
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </div>
          </div>
        </div>

        {/* Health Warning Banner */}
        {healthResult?.status === "warning" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
              🚨 偵測到資料異常
            </h3>
            <div className="text-sm text-red-700">
              {healthResult.duplicate_count > 0 && (
                <p className="mb-1">• 重複 Participant ID：{healthResult.duplicate_count} 組</p>
              )}
              {healthResult.invalid_count > 0 && (
                <p>• 異常資料記錄：{healthResult.invalid_count} 筆</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const ids = healthResult.duplicates.map(d => d.id).join(", ");
                    navigator.clipboard.writeText(ids);
                    alert(`已複製重複 ID 清單：\n${ids}`);
                  }}
                  className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-medium"
                >
                  📋 複製重複 ID
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            <option value="all">所有班級</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
            <option value="all">所有組別</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜尋 ID、姓名、學號…"
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-xs text-gray-400 self-center">{filtered.length} / {participants.length} 人</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">無符合資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["參與者 ID", "姓名", "學號", "班級", "組別", "年資", "操作"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{p.participant_id}</td>
                      <td className="px-4 py-3 text-gray-700">{p.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{p.student_id || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{p.class_id || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                          p.group === "AI_Pair"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {p.group}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.years_experience ?? 0} 年</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(p.id, p.participant_id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition font-medium"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ParticipantManager() {
  return (
    <TeacherAuthGuard>
      <ParticipantManagerInner />
    </TeacherAuthGuard>
  );
}