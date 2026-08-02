import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const CLASS_LIST = ["電子一甲", "電子二甲", "電子二乙", "測試班級"];

// Unified helper: resolve assignment ID from various object shapes
const getAssignmentId = (obj) =>
  obj?.assignment?.id || obj?.assignment || obj?.assignment_id;

export default function AssignmentBatchOpenPanel({ assignments }) {
  const [availabilities, setAvailabilities] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([CLASS_LIST[0]]);
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(""); // "saved" | "error" | ""
  const [loadError, setLoadError] = useState("");

  // For display, use first selected class to show availability status
  const selectedClass = selectedClasses[0] || CLASS_LIST[0];

  const weeks = [...new Set(assignments.map((a) => a.week_number))].sort((a, b) => a - b);

  const filteredAssignments = assignments.filter((a) =>
    selectedWeek === "all" || String(a.week_number) === String(selectedWeek)
  ).sort((a, b) => a.week_number - b.week_number || a.task_number - b.task_number);

  const loadAvailabilities = async () => {
    if (selectedClasses.length === 0) return;
    setLoadError("");
    try {
      // Load for first selected class for display purposes
      const data = await base44.entities.AssignmentAvailability.filter({ class_id: selectedClass });
      setAvailabilities(data);
    } catch (e) {
      setLoadError("載入開放狀態失敗，請重新整理");
    }
  };

  const toggleClass = (cls) => {
    setSelectedClasses((prev) => {
      if (prev.includes(cls)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((c) => c !== cls);
      }
      return [...prev, cls];
    });
    setSelectedTasks(new Set());
  };

  useEffect(() => {
    loadAvailabilities();
    setSelectedTasks(new Set());
  }, [selectedClasses.join(",")]);

  // Use helper to match by assignment ID
  const getAvailability = (assignmentId) =>
    availabilities.find((av) => getAssignmentId(av) === assignmentId);

  // Returns: true=open, false=closed, null=fallback to Assignment.is_open
  const isOpenForClass = (assignmentId) => {
    const av = getAvailability(assignmentId);
    return av !== undefined ? av.is_open : null;
  };

  const toggleTask = (id) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedTasks(new Set(filteredAssignments.map((a) => a.id)));
  const clearAll = () => setSelectedTasks(new Set());

  const executeBatch = async (openValue) => {
    if (selectedTasks.size === 0) return alert("請先選擇至少一個任務");
    setSaving(true);
    setSaveStatus("");
    try {
      const now = new Date().toISOString();
      let user = null;
      try { user = await base44.auth.me(); } catch {}
      const updatedBy = user?.email || "admin";

      const taskIds = [...selectedTasks];

      for (const cls of selectedClasses) {
        const clsAvailabilities = await base44.entities.AssignmentAvailability.filter({ class_id: cls });

        for (let i = 0; i < taskIds.length; i++) {
          const assignmentId = taskIds[i];
          const assignment = assignments.find((a) => a.id === assignmentId);
          const existing = clsAvailabilities.find((av) => getAssignmentId(av) === assignmentId);
          const payload = {
            assignment: assignmentId,
            assignment_id_str: assignment?.assignment_id || "",
            class_id: cls,
            is_open: openValue,
            updated_by: updatedBy,
            updated_at: now,
          };
          if (existing) {
            await base44.entities.AssignmentAvailability.update(existing.id, payload);
          } else {
            await base44.entities.AssignmentAvailability.create(payload);
          }
          // Throttle to avoid rate limit (300ms between requests)
          if (i < taskIds.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      }

      await loadAvailabilities();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e) {
      console.error("[BatchOpen] save error:", e);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-800 mb-3">班級批次開放設定</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">班級（可多選）</label>
            <div className="flex flex-wrap gap-2">
              {CLASS_LIST.map((c) => {
                const checked = selectedClasses.includes(c);
                return (
                  <label key={c} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition select-none ${
                    checked ? "bg-blue-50 border-blue-400 text-blue-700" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClass(c)}
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                    {c}
                  </label>
                );
              })}
            </div>
            {selectedClasses.length > 1 && (
              <p className="text-[10px] text-amber-600 mt-1">已選 {selectedClasses.length} 個班級，批次操作將同時套用</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">週次篩選</label>
            <select
              value={selectedWeek}
              onChange={(e) => { setSelectedWeek(e.target.value); setSelectedTasks(new Set()); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="all">所有週次</option>
              {weeks.map((w) => <option key={w} value={String(w)}>第 {w} 週</option>)}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={selectAll} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition">全選</button>
            <button onClick={clearAll} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition">清除</button>
            <button
              onClick={() => executeBatch(true)}
              disabled={saving || selectedTasks.size === 0}
              className="px-4 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
            >
              {saving ? "處理中…" : "🟢 批次開放"}
            </button>
            <button
              onClick={() => executeBatch(false)}
              disabled={saving || selectedTasks.size === 0}
              className="px-4 py-1.5 text-xs font-semibold bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {saving ? "處理中…" : "🔒 批次關閉"}
            </button>
          </div>
        </div>
        {loadError && <p className="text-xs text-red-500 mt-2">{loadError}</p>}
        {saveStatus === "saved" && (
          <p className="text-xs text-green-600 mt-2 font-medium">✓ 已儲存，{selectedClasses.length} 個班級 × {selectedTasks.size} 筆任務設定更新完成</p>
        )}
        {saveStatus === "error" && (
          <p className="text-xs text-red-500 mt-2">✗ 儲存失敗，請重試</p>
        )}
        {selectedTasks.size > 0 && (
          <p className="text-xs text-blue-600 mt-2">已選取 {selectedTasks.size} 個任務</p>
        )}
      </div>

      {/* Task grid by week */}
      {weeks
        .filter((w) => selectedWeek === "all" || String(w) === String(selectedWeek))
        .map((weekNum) => {
          const weekTasks = filteredAssignments.filter((a) => a.week_number === weekNum);
          return (
            <div key={weekNum} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-gray-800">第 {weekNum} 週</h3>
                <button
                  onClick={() => {
                    const ids = weekTasks.map((a) => a.id);
                    const allSelected = ids.every((id) => selectedTasks.has(id));
                    setSelectedTasks((prev) => {
                      const next = new Set(prev);
                      if (allSelected) ids.forEach((id) => next.delete(id));
                      else ids.forEach((id) => next.add(id));
                      return next;
                    });
                  }}
                  className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 transition"
                >
                  {weekTasks.every((a) => selectedTasks.has(a.id)) ? "取消整週" : "選取整週"}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {weekTasks.map((task) => {
                  const openStatus = isOpenForClass(task.id); // for primary display class
                  const isSelected = selectedTasks.has(task.id);
                  // Priority: class-level > Assignment.is_open > closed
                  const displayOpen = openStatus !== null ? openStatus : (task.is_open === true);
                  const isGlobalFallback = openStatus === null;
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      className={`relative border rounded-lg p-3 cursor-pointer transition select-none ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <p className="text-sm font-bold text-gray-800">T{task.task_number}</p>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{task.title || `任務${task.task_number}`}</p>
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          displayOpen ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {displayOpen ? "🟢 已開放" : "🔒 未開放"}
                        </span>
                        {isGlobalFallback && (
                          <span className="text-[9px] text-gray-400 italic">全域</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}