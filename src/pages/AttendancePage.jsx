import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ClassWeekDatesModal, { loadAllClassDates, loadAllClassDatesFromDB, getClassWeekDate, getClassWeekPeriods, isCurrentWeek, PERIODS } from "@/components/ClassWeekDatesModal";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

const STATUS_OPTIONS = ["出席", "缺席", "遲到", "早退", "公假", "病假"];

const STATUS_STYLE = {
  "出席": "bg-green-100 text-green-700 border-green-300",
  "缺席": "bg-red-100 text-red-700 border-red-300",
  "遲到": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "早退": "bg-orange-100 text-orange-700 border-orange-300",
  "公假": "bg-blue-100 text-blue-700 border-blue-300",
  "病假": "bg-purple-100 text-purple-700 border-purple-300",
};

const STATUS_SHORT = {
  "出席": "出", "缺席": "缺", "遲到": "遲", "早退": "早", "公假": "公", "病假": "病",
};

const WEEKS = [1, 2, 3, 4, 5, 6];

// key format: "participantId_weekNum_periodNum"
const makeKey = (participantId, weekNum, periodNum) => `${participantId}_${weekNum}_${periodNum}`;

function AttendancePageInner() {
  const [participants, setParticipants] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterClass, setFilterClass] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [pendingChanges, setPendingChanges] = useState({});
  const [noteModal, setNoteModal] = useState(null); // { participantId, weekNum, periodNum }
  const [noteInput, setNoteInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [sortField, setSortField] = useState('participant_id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [allClassDates, setAllClassDates] = useState({});
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  useEffect(() => {
    loadData();
    loadAllClassDatesFromDB().then(dates => setAllClassDates(dates)).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [ps, rs] = await Promise.all([
      base44.entities.Participant.list('-created_date', 200),
      base44.entities.AttendanceRecord.list('-created_date', 2000),
    ]);
    setParticipants(ps);
    setRecords(rs);
    setLoading(false);
  };

  // Find record: supports both old (no period_number) and new (with period_number)
  const getRecord = (participantId, weekNum, periodNum = null) => {
    return records.find(r =>
      r.participant_id === participantId &&
      r.week_number === weekNum &&
      (periodNum === null ? !r.period_number : r.period_number === periodNum)
    );
  };

  const getStatus = (participantId, weekNum, periodNum) => {
    const key = makeKey(participantId, weekNum, periodNum);
    if (key in pendingChanges) return pendingChanges[key];
    return getRecord(participantId, weekNum, periodNum)?.status || null;
  };

  const getNote = (participantId, weekNum, periodNum) => {
    return getRecord(participantId, weekNum, periodNum)?.note || "";
  };

  const handleStatusClick = (participantId, weekNum, periodNum, currentStatus) => {
    const key = makeKey(participantId, weekNum, periodNum);
    if (!currentStatus) {
      setPendingChanges(prev => ({ ...prev, [key]: STATUS_OPTIONS[0] }));
    } else {
      const currentIdx = STATUS_OPTIONS.indexOf(currentStatus);
      if (currentIdx === STATUS_OPTIONS.length - 1) {
        setPendingChanges(prev => ({ ...prev, [key]: null }));
      } else {
        setPendingChanges(prev => ({ ...prev, [key]: STATUS_OPTIONS[currentIdx + 1] }));
      }
    }
  };

  const handleSaveAll = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setSaving(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();

    for (const [key, status] of Object.entries(pendingChanges)) {
      const parts = key.split("_");
      // key = "participantId_weekNum_periodNum"
      const periodNum = parseInt(parts[parts.length - 1]);
      const weekNum = parseInt(parts[parts.length - 2]);
      const participantId = parts.slice(0, parts.length - 2).join("_");
      const participant = participants.find(p => p.participant_id === participantId);
      if (!participant) continue;

      const existing = getRecord(participantId, weekNum, periodNum);
      if (existing) {
        await base44.entities.AttendanceRecord.update(existing.id, {
          status,
          recorded_by: user?.email || "admin",
          recorded_at: now,
        });
      } else {
        await base44.entities.AttendanceRecord.create({
          participant_id: participantId,
          participant_db_id: participant.id,
          week_number: weekNum,
          period_number: periodNum,
          class_id: participant.class_id || "",
          status,
          recorded_by: user?.email || "admin",
          recorded_at: now,
        });
      }
    }

    setPendingChanges({});
    setSaving(false);
    await loadData();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    const { participantId, weekNum, periodNum } = noteModal;
    const participant = participants.find(p => p.participant_id === participantId);
    const existing = getRecord(participantId, weekNum, periodNum);
    const user = await base44.auth.me();
    const now = new Date().toISOString();

    if (existing) {
      await base44.entities.AttendanceRecord.update(existing.id, { note: noteInput });
    } else {
      const currentStatus = getStatus(participantId, weekNum, periodNum) || "出席";
      await base44.entities.AttendanceRecord.create({
        participant_id: participantId,
        participant_db_id: participant?.id || "",
        week_number: weekNum,
        period_number: periodNum,
        class_id: participant?.class_id || "",
        status: currentStatus,
        note: noteInput,
        recorded_by: user?.email || "admin",
        recorded_at: now,
      });
    }
    setNoteModal(null);
    setNoteInput("");
    await loadData();
  };

  // 一鍵遷移：將舊格式（period_number=0/null）的記錄複製到每個節次
  const handleMigrateOldRecords = async () => {
    setMigrating(true);
    setMigrateResult(null);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    const currentDates = allClassDates;
    let migratedCount = 0;
    let skippedCount = 0;

    // Find all old-style records (period_number = 0 or null/undefined)
    const oldRecords = records.filter(r => !r.period_number || r.period_number === 0);

    for (const rec of oldRecords) {
      const participant = participants.find(p => p.participant_id === rec.participant_id);
      if (!participant) { skippedCount++; continue; }

      const periods = getClassWeekPeriods(currentDates, participant.class_id, rec.week_number);
      if (periods.length === 0) { skippedCount++; continue; }

      // Create one record per period (skip if already exists)
      for (const pn of periods) {
        const exists = records.find(r =>
          r.participant_id === rec.participant_id &&
          r.week_number === rec.week_number &&
          r.period_number === pn
        );
        if (exists) continue;
        await base44.entities.AttendanceRecord.create({
          participant_id: rec.participant_id,
          participant_db_id: participant.id,
          week_number: rec.week_number,
          period_number: pn,
          class_id: participant.class_id || "",
          status: rec.status,
          note: rec.note || "",
          recorded_by: user?.email || "admin",
          recorded_at: now,
        });
        migratedCount++;
      }

      // Delete the old record
      await base44.entities.AttendanceRecord.delete(rec.id);
    }

    await loadData();
    setMigrating(false);
    setMigrateResult({ migrated: migratedCount, skipped: skippedCount });
    setTimeout(() => setMigrateResult(null), 5000);
  };

  // Get periods for a participant's class for a given week
  const getPeriodsForRow = (classId, weekNum) => {
    const periods = getClassWeekPeriods(allClassDates, classId, weekNum);
    return periods; // array of period numbers, e.g. [1, 2, 3]
  };

  // Summary stats: count absent/present across all period records
  const getSummaryStats = (participantId, classId) => {
    // Collect all period records for this participant
    const allStatuses = [];
    WEEKS.forEach(w => {
      const periods = getClassWeekPeriods(allClassDates, classId, w);
      if (periods.length === 0) {
        // fallback: old-style single record
        const s = getStatus(participantId, w, 0);
        if (s) allStatuses.push(s);
      } else {
        periods.forEach(pn => {
          const s = getStatus(participantId, w, pn);
          if (s) allStatuses.push(s);
        });
      }
    });
    const absent = allStatuses.filter(s => s === "缺席").length;
    const present = allStatuses.filter(s => ["出席", "遲到", "早退"].includes(s)).length;
    const total = allStatuses.length;
    return { absent, present, total, rate: total > 0 ? Math.round((present / total) * 100) : null };
  };

  const exportCSV = () => {
    const headers = ["參與者ID", "班級", "姓名", "學號", "組別",
      ...WEEKS.flatMap(w => [`W${w}`, `W${w}_備註`]),
      "缺席次數", "出席率"
    ];
    const rows = filteredParticipants.map(p => {
      const weekData = WEEKS.flatMap(w => {
        const periods = getPeriodsForRow(p.class_id, w);
        if (periods.length === 0) {
          return [getStatus(p.participant_id, w, 0) || "—", getNote(p.participant_id, w, 0)];
        }
        const statuses = periods.map(pn => STATUS_SHORT[getStatus(p.participant_id, w, pn)] || "—").join("");
        const notes = periods.map(pn => getNote(p.participant_id, w, pn)).filter(Boolean).join(";");
        return [statuses, notes];
      });
      const stats = getSummaryStats(p.participant_id, p.class_id);
      return [
        p.participant_id, p.class_id || "", p.name || "", p.student_id || "", p.group || "",
        ...weekData,
        stats.absent,
        stats.rate !== null ? `${stats.rate}%` : "—",
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const filteredParticipants = participants
    .filter(p => filterClass === "all" || p.class_id === filterClass)
    .filter(p => filterGroup === "all" || p.group === filterGroup)
    .filter(p => {
      if (!searchText.trim()) return true;
      const t = searchText.toLowerCase();
      return (p.name || "").toLowerCase().includes(t) ||
        (p.participant_id || "").toLowerCase().includes(t) ||
        (p.student_id || "").toLowerCase().includes(t);
    })
    .sort((a, b) => {
      let aVal = sortField === 'student_id' ? (a.student_id || '') : (a.participant_id || '');
      let bVal = sortField === 'student_id' ? (b.student_id || '') : (b.participant_id || '');
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const classes = [...new Set(participants.map(p => p.class_id).filter(Boolean))];

  const glass = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
    borderRadius: "16px",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #f7f5ff 40%, #f0f9ff 100%)" }}>
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #f7f5ff 40%, #f0f9ff 100%)" }}>
      {/* Ambient blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "40%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "30%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>
      <div className="max-w-7xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="mb-6">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1 text-sm hover:opacity-70 mb-3 transition" style={{ color: "#6e6e73" }}>
            ← 返回教師看板
          </a>
        </div>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f", letterSpacing: "-0.3px" }}>出缺勤紀錄表</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>W1～W6 每週出席狀況 · 每節次獨立記錄 · 點擊格子切換狀態</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={exportCSV} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#3a3a3c" }}>
              ⬇ 匯出 CSV
            </button>
            {(() => {
              const oldCount = records.filter(r => !r.period_number || r.period_number === 0).length;
              if (oldCount === 0) return null;
              return (
                <button
                  onClick={handleMigrateOldRecords}
                  disabled={migrating}
                  className="px-4 py-2 text-sm font-medium disabled:opacity-50 transition"
                  style={{ background: "rgba(255,237,213,0.8)", border: "1px solid rgba(251,146,60,0.4)", borderRadius: "10px", color: "#c2410c" }}
                >
                  {migrating ? "遷移中…" : `🔄 遷移舊資料 (${oldCount} 筆)`}
                </button>
              );
            })()}
            {migrateResult && (
              <span className="text-sm font-medium self-center" style={{ color: "#15803d" }}>
                ✅ 已遷移 {migrateResult.migrated} 筆，略過 {migrateResult.skipped} 筆
              </span>
            )}
            <button
              onClick={handleSaveAll}
              disabled={saving || Object.keys(pendingChanges).length === 0}
              className="px-4 py-2 text-sm font-medium transition disabled:opacity-50"
              style={{
                background: savedFlash
                  ? "rgba(52,199,89,0.9)"
                  : Object.keys(pendingChanges).length > 0
                  ? "rgba(0,122,255,0.9)"
                  : "rgba(200,200,210,0.5)",
                color: Object.keys(pendingChanges).length > 0 || savedFlash ? "#fff" : "#8e8e93",
                border: "1px solid transparent",
                borderRadius: "10px",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              }}
            >
              {saving ? "儲存中…" : savedFlash ? "✅ 已儲存" : `💾 儲存變更${Object.keys(pendingChanges).length > 0 ? ` (${Object.keys(pendingChanges).length})` : ""}`}
            </button>
          </div>
        </div>

        {/* Week Date Settings */}
        <div className="p-4 mb-5" style={glass}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold" style={{ color: "#3a3a3c" }}>📅 各班級上課日期</span>
            <button
              onClick={() => setShowDatesModal(true)}
              className="text-xs px-3 py-1 font-medium transition"
              style={{ background: "rgba(0,122,255,0.08)", border: "1px solid rgba(0,122,255,0.25)", borderRadius: "8px", color: "#0071e3" }}
            >
              ✏️ 編輯日期設定
            </button>
          </div>
          <div className="space-y-2">
            {classes.map(cls => (
              <div key={cls} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold w-16 flex-shrink-0 px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.05)", color: "#3a3a3c" }}>{cls}</span>
                {WEEKS.map(w => {
                  const dateStr = getClassWeekDate(allClassDates, cls, w);
                  const periods = getClassWeekPeriods(allClassDates, cls, w);
                  const isCurrent = isCurrentWeek(dateStr);
                  return (
                    <span key={w} className="text-xs px-2 py-1 rounded" style={isCurrent
                      ? { background: "rgba(0,122,255,0.1)", border: "1px solid rgba(0,122,255,0.3)", color: "#0071e3", fontWeight: 600 }
                      : dateStr
                      ? { background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", color: "#6e6e73" }
                      : { border: "1px dashed rgba(0,0,0,0.12)", color: "#aeaeb2" }
                    }>
                      W{w}{dateStr ? ` ${dateStr.slice(5).replace("-", "/")}` : " —"}
                      {periods.length > 0 && <span className="ml-1" style={{ color: "#aeaeb2" }}>·{periods.length}節</span>}
                      {isCurrent && <span className="ml-1 px-1 rounded-full text-xs" style={{ background: "#0071e3", color: "#fff" }}>本週</span>}
                    </span>
                  );
                })}
              </div>
            ))}
            {classes.length === 0 && <p className="text-xs" style={{ color: "#aeaeb2" }}>尚無班級資料</p>}
          </div>
        </div>

        {/* Legend */}
        <div className="p-4 mb-5 flex flex-wrap gap-3 items-center" style={glass}>
          <span className="text-xs font-semibold mr-2" style={{ color: "#6e6e73" }}>狀態說明：</span>
          {STATUS_OPTIONS.map(s => (
            <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_STYLE[s]}`}>{s}</span>
          ))}
          <span className="text-xs ml-2" style={{ color: "#aeaeb2" }}>· 每格代表一節課 · 點擊切換狀態</span>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="搜尋姓名、學號或ID..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="px-3 py-2 text-sm focus:outline-none w-56"
            style={{ background: "rgba(255,255,255,0.70)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.80)", boxShadow: "0 1px 8px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
          />
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-2 text-sm focus:outline-none"
            style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
          >
            <option value="all">全部班級</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="px-3 py-2 text-sm focus:outline-none"
            style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
          >
            <option value="all">全部組別</option>
            <option value="AI_Pair">AI_Pair</option>
            <option value="AI_Solo">AI_Solo</option>
          </select>
          <span className="text-xs self-center" style={{ color: "#aeaeb2" }}>共 {filteredParticipants.length} 人</span>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs" style={{ color: "#6e6e73" }}>排序：</span>
            <button
              onClick={() => { setSortField('participant_id'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }}
              className="text-xs px-2.5 py-1.5 font-medium transition"
              style={sortField === 'participant_id'
                ? { background: "rgba(0,122,255,0.9)", color: "#fff", border: "1px solid transparent", borderRadius: "8px" }
                : { background: "rgba(255,255,255,0.72)", color: "#3a3a3c", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "8px" }}
            >
              ID {sortField === 'participant_id' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => { setSortField('student_id'); setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); }}
              className="text-xs px-2.5 py-1.5 font-medium transition"
              style={sortField === 'student_id'
                ? { background: "rgba(0,122,255,0.9)", color: "#fff", border: "1px solid transparent", borderRadius: "8px" }
                : { background: "rgba(255,255,255,0.72)", color: "#3a3a3c", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "8px" }}
            >
              學號 {sortField === 'student_id' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>

        {/* Pending changes notice */}
        {Object.keys(pendingChanges).length > 0 && (
          <div className="px-4 py-2 mb-4 text-sm font-medium rounded-xl" style={{ background: "rgba(255,251,235,0.85)", border: "1px solid rgba(251,191,36,0.4)", color: "#b45309" }}>
            ⚠ 有 {Object.keys(pendingChanges).length} 筆未儲存的變更，請記得點擊「儲存變更」。
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto" style={{ ...glass, borderRadius: "16px" }}>
          <table className="min-w-max w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.025)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                <th className="sticky left-0 z-20 text-left px-3 py-3 font-semibold whitespace-nowrap w-[90px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>ID</th>
                <th className="sticky left-[90px] z-20 text-left px-3 py-3 font-semibold whitespace-nowrap w-[70px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>班級</th>
                <th className="sticky left-[160px] z-20 text-left px-3 py-3 font-semibold whitespace-nowrap w-[64px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>姓名</th>
                <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>學號</th>
                <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>組別</th>
                {WEEKS.map(w => {
                  const dateStr = filterClass !== "all" ? getClassWeekDate(allClassDates, filterClass, w) : null;
                  const periods = filterClass !== "all" ? getClassWeekPeriods(allClassDates, filterClass, w) : [];
                  const isCurrent = isCurrentWeek(dateStr);
                  return (
                    <th key={w} className="text-center px-3 py-3 font-semibold whitespace-nowrap" style={isCurrent ? { color: "#0071e3", background: "rgba(0,122,255,0.06)" } : { color: "#1d1d1f" }}>
                      <div>W{w}</div>
                      {dateStr && (
                        <div className="text-xs font-normal mt-0.5" style={{ color: isCurrent ? "#0071e3" : "#aeaeb2" }}>
                          {dateStr.slice(5).replace("-", "/")}
                        </div>
                      )}
                      {periods.length > 0 && (
                        <div className="text-xs font-normal mt-0.5" style={{ color: "#aeaeb2" }}>{periods.length} 節</div>
                      )}
                      {isCurrent && <div className="text-xs font-bold mt-0.5" style={{ color: "#0071e3" }}>本週</div>}
                    </th>
                  );
                })}
                <th className="text-center px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>缺席</th>
                <th className="text-center px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>出席率</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p, idx) => {
                const stats = getSummaryStats(p.participant_id, p.class_id);
                return (
                  <tr key={p.id} className="transition" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }} onMouseEnter={e => e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td className="sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap w-[90px]" style={{ background: "rgba(250,250,252,0.97)", color: "#1d1d1f" }}>
                      <a href={`/StudentDetailPage?id=${p.participant_id}`} className="hover:underline" style={{ color: "#0071e3" }}>{p.participant_id}</a>
                    </td>
                    <td className="sticky left-[90px] z-10 px-3 py-2 whitespace-nowrap w-[70px]" style={{ background: "rgba(250,250,252,0.97)", color: "#3a3a3c" }}>{p.class_id || "—"}</td>
                    <td className="sticky left-[160px] z-10 px-3 py-2 whitespace-nowrap w-[64px]" style={{ background: "rgba(250,250,252,0.97)", color: "#3a3a3c" }}>{p.name || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: "#3a3a3c" }}>{p.student_id || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        p.group === "AI_Pair"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>{p.group || "—"}</span>
                    </td>
                    {WEEKS.map(w => {
                      const periods = getPeriodsForRow(p.class_id, w);
                      const note = periods.length > 0
                        ? periods.map(pn => getNote(p.participant_id, w, pn)).filter(Boolean).join("; ")
                        : getNote(p.participant_id, w, 0);

                      if (periods.length === 0) {
                        // No periods configured: show single cell (backward compat)
                        const status = getStatus(p.participant_id, w, 0);
                        const isPending = makeKey(p.participant_id, w, 0) in pendingChanges;
                        return (
                          <td key={w} className="px-2 py-1.5 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => handleStatusClick(p.participant_id, w, 0, status)}
                                className={`w-14 h-7 rounded-lg border text-xs font-bold transition hover:opacity-80 ${
                                  status ? STATUS_STYLE[status] : "bg-gray-100 text-gray-300 border-gray-200 hover:bg-gray-200"
                                } ${isPending ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
                                title={`W${w} 狀態`}
                              >
                                {status || "—"}
                              </button>
                              <button
                                onClick={() => { setNoteModal({ participantId: p.participant_id, weekNum: w, periodNum: 0 }); setNoteInput(note); }}
                                className={`text-xs px-1.5 py-0.5 rounded transition ${note ? "text-blue-500 bg-blue-50 hover:bg-blue-100" : "text-gray-300 hover:text-gray-400"}`}
                              >
                                {note ? "📝" : "+備註"}
                              </button>
                            </div>
                          </td>
                        );
                      }

                      // Show one mini-block per period
                      return (
                        <td key={w} className="px-1.5 py-1.5">
                          <div className="flex gap-0.5 flex-wrap justify-center">
                            {periods.map(pn => {
                              const status = getStatus(p.participant_id, w, pn);
                              const isPending = makeKey(p.participant_id, w, pn) in pendingChanges;
                              const periodInfo = PERIODS.find(p => p.num === pn);
                              return (
                                <button
                                  key={pn}
                                  onClick={() => handleStatusClick(p.participant_id, w, pn, status)}
                                  className={`w-7 h-7 rounded border text-xs font-bold transition hover:opacity-80 flex flex-col items-center justify-center leading-none
                                    ${status ? STATUS_STYLE[status] : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"}
                                    ${isPending ? "ring-2 ring-offset-1 ring-blue-400" : ""}
                                  `}
                                  title={`第${pn}節 ${periodInfo?.time || ""} · ${status || "未設定"}`}
                                >
                                  <span style={{ fontSize: "9px" }} className="font-semibold">{pn}</span>
                                  {status && <span style={{ fontSize: "8px" }}>{STATUS_SHORT[status]}</span>}
                                </button>
                              );
                            })}
                          </div>
                          {note && (
                            <div className="text-center mt-0.5">
                              <span className="text-xs text-blue-500">📝</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-semibold">
                      {stats.absent > 0 ? (
                        <span className="text-red-600">{stats.absent}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {stats.rate !== null ? (
                        <span className={stats.rate >= 80 ? "text-green-600" : stats.rate >= 60 ? "text-yellow-600" : "text-red-600"}>
                          {stats.rate}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan={4 + WEEKS.length + 2} className="text-center py-10" style={{ color: "#aeaeb2" }}>沒有符合條件的學生</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Class summary */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {classes.map(cls => {
            const classPs = participants.filter(p => p.class_id === cls);
            const totalAbsent = classPs.reduce((sum, p) => {
              const s = getSummaryStats(p.participant_id, cls);
              return sum + s.absent;
            }, 0);
            const avgRate = classPs.length > 0
              ? Math.round(classPs.reduce((sum, p) => {
                  const s = getSummaryStats(p.participant_id, cls);
                  return sum + (s.rate ?? 100);
                }, 0) / classPs.length)
              : 0;
            return (
              <div key={cls} className="p-4" style={glass}>
                <p className="font-semibold mb-2" style={{ color: "#1d1d1f" }}>{cls}</p>
                <div className="flex gap-4 text-sm">
                  <div><p className="text-xs" style={{ color: "#aeaeb2" }}>人數</p><p className="font-bold" style={{ color: "#3a3a3c" }}>{classPs.length} 人</p></div>
                  <div><p className="text-xs" style={{ color: "#aeaeb2" }}>總缺席</p><p className="font-bold text-red-500">{totalAbsent} 次</p></div>
                  <div><p className="text-xs" style={{ color: "#aeaeb2" }}>平均出席率</p><p className={`font-bold ${avgRate >= 80 ? "text-green-600" : "text-yellow-600"}`}>{avgRate}%</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Class Week Dates Modal */}
      {showDatesModal && (
        <ClassWeekDatesModal
          classes={classes}
          onClose={(updatedDates) => {
            setAllClassDates(updatedDates);
            setShowDatesModal(false);
          }}
        />
      )}

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" style={{ backdropFilter: "blur(8px)" }} onClick={() => setNoteModal(null)}>
          <div className="p-6 w-full max-w-sm mx-4" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", borderRadius: "20px" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-1" style={{ color: "#1d1d1f" }}>
              {noteModal.participantId} · W{noteModal.weekNum}{noteModal.periodNum ? ` 第${noteModal.periodNum}節` : ""} 備註
            </h3>
            <p className="text-xs mb-3" style={{ color: "#aeaeb2" }}>輸入出缺勤相關備註（如請假原因等）</p>
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={4}
              placeholder="請輸入備註…"
              className="w-full px-3 py-2 text-sm focus:outline-none resize-none"
              style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "10px", color: "#1d1d1f" }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setNoteModal(null)} className="flex-1 py-2 text-sm transition" style={{ background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "10px", color: "#3a3a3c" }}>取消</button>
              <button onClick={handleSaveNote} className="flex-1 py-2 text-sm font-medium transition" style={{ background: "rgba(0,122,255,0.9)", border: "1px solid transparent", borderRadius: "10px", color: "#fff" }}>儲存備註</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <TeacherAuthGuard>
      <AttendancePageInner />
    </TeacherAuthGuard>
  );
}