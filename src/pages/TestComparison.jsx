import { useState, useEffect } from "react";
import { getScoreSelections } from "@/utils/scoreSelections.js";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import StudentDetailDrawer from "@/components/StudentDetailDrawer";
import GroupEfficiencyPanel from "@/components/GroupEfficiencyPanel";

function TestComparisonInner() {
  const [participants, setParticipants] = useState([]);
  const [preQuizResults, setPreQuizResults] = useState([]);
  const [postQuizResults, setPostQuizResults] = useState([]);
  const [preScaleResponses, setPreScaleResponses] = useState([]);
  const [postScaleResponses, setPostScaleResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClasses, setFilterClasses] = useState(["電子一甲", "電子二甲", "電子二乙"]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const [p, preQR, postQR, preSR, postSR] = await Promise.all([
        base44.entities.Participant.list(),
        base44.entities.QuizResult.filter({ survey_type: "pre" }),
        base44.entities.QuizResult.filter({ survey_type: "post" }),
        base44.entities.ScaleResponse.filter({ survey_type: "pre" }),
        base44.entities.ScaleResponse.filter({ survey_type: "post" }),
      ]);
      setParticipants(p);
      setPreQuizResults(preQR);
      setPostQuizResults(postQR);
      setPreScaleResponses(preSR);
      setPostScaleResponses(postSR);
      setLoading(false);
    };
    fetchData();
  }, []);

  // --- Score helpers (respects per-participant selection from StudentDetailPage) ---
  const getSelectedQuiz = (results, participantDbId, field) => {
    const all = results.filter(r => r.participant === participantDbId);
    if (all.length === 0) return null;
    const sorted = [...all].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    const selections = getScoreSelections(participantDbId);
    const choice = selections[field] || "latest";
    const chosen = choice === "original" ? sorted[0] : sorted[sorted.length - 1];
    return chosen?.score ?? null;
  };

  const getSelectedScale = (responses, participantDbId, part, field) => {
    const all = responses.filter(r => r.participant === participantDbId && r.part === part);
    if (all.length === 0) return null;
    const sorted = [...all].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    const selections = getScoreSelections(participantDbId);
    const choice = selections[field] || "latest";
    const chosen = choice === "original" ? sorted[0] : sorted[sorted.length - 1];
    return chosen?.total_score ?? null;
  };

  const getDelta = (pre, post) => {
    if (pre === null || post === null) return null;
    return post - pre;
  };

  const filteredParticipants = participants
    .filter(p => filterClasses.length === 0 || filterClasses.includes(p.class_id))
    .filter(p => filterGroups.length === 0 || filterGroups.includes(p.group));

  // Build per-participant data (uses score selections from StudentDetailPage)
  const participantData = filteredParticipants.map(p => {
    const preQuiz = getSelectedQuiz(preQuizResults, p.id, "preQuiz");
    const postQuiz = getSelectedQuiz(postQuizResults, p.id, "postQuiz");
    const preAnxiety = getSelectedScale(preScaleResponses, p.id, "anxiety", "preAnxiety");
    const postAnxiety = getSelectedScale(postScaleResponses, p.id, "anxiety", "postAnxiety");
    const preEfficacy = getSelectedScale(preScaleResponses, p.id, "efficacy", "preEfficacy");
    const postEfficacy = getSelectedScale(postScaleResponses, p.id, "efficacy", "postEfficacy");
    const postCollaboration = getSelectedScale(postScaleResponses, p.id, "collaboration", "postCollab");
    return {
      ...p,
      preQuiz,
      postQuiz,
      deltaQuiz: getDelta(preQuiz, postQuiz),
      preAnxiety,
      postAnxiety,
      deltaAnxiety: getDelta(preAnxiety, postAnxiety),
      preEfficacy,
      postEfficacy,
      deltaEfficacy: getDelta(preEfficacy, postEfficacy),
      postCollaboration,
    };
  });

  // Sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const sortedData = [...participantData].sort((a, b) => {
    if (!sortConfig.key) return 0;
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];
    if (aVal === null || aVal === undefined) aVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;
    if (bVal === null || bVal === undefined) bVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Stat comparison helper
  const getCompareStat = (field) => {
    const vals = participantData.filter(d => d[`pre${field}`] !== null && d[`post${field}`] !== null);
    if (vals.length === 0) return { preAvg: "—", postAvg: "—", deltaAvg: "—", count: 0 };
    const preAvg = (vals.reduce((s, d) => s + d[`pre${field}`], 0) / vals.length).toFixed(1);
    const postAvg = (vals.reduce((s, d) => s + d[`post${field}`], 0) / vals.length).toFixed(1);
    const deltaAvg = (vals.reduce((s, d) => s + d[`delta${field}`], 0) / vals.length).toFixed(1);
    return { preAvg, postAvg, deltaAvg, count: vals.length };
  };

  // Chart data: pre/post avg by group
  const getGroupCompareData = (field) => {
    const groups = ["AI_Pair", "AI_Solo"];
    return groups.map(g => {
      const gData = participantData.filter(d => d.group === g && d[`pre${field}`] !== null && d[`post${field}`] !== null);
      if (gData.length === 0) return { group: g, 前測: 0, 後測: 0 };
      const preAvg = gData.reduce((s, d) => s + d[`pre${field}`], 0) / gData.length;
      const postAvg = gData.reduce((s, d) => s + d[`post${field}`], 0) / gData.length;
      return { group: g, 前測: parseFloat(preAvg.toFixed(1)), 後測: parseFloat(postAvg.toFixed(1)) };
    });
  };

  // CSV Export (scores use per-participant selections from StudentDetailPage)
  const handleExport = () => {
    const headers = [
      "學號", "參與者ID", "姓名", "班級", "組別",
      "學習成就前測(選定)", "學習成就後測(選定)", "學習成就進步",
      "焦慮量表前測(選定)", "焦慮量表後測(選定)", "焦慮量表變化",
      "自我效能感前測(選定)", "自我效能感後測(選定)", "自我效能感進步",
      "協作學習知覺後測(選定)",
    ];
    const rows = [...participantData]
      .sort((a, b) => (a.student_id || "").localeCompare(b.student_id || "", undefined, { numeric: true }))
      .map(d => [
        d.student_id || "", d.participant_id, d.name || "", d.class_id || "", d.group || "",
        d.preQuiz ?? "—", d.postQuiz ?? "—", d.deltaQuiz !== null ? (d.deltaQuiz > 0 ? `+${d.deltaQuiz}` : d.deltaQuiz) : "—",
        d.preAnxiety ?? "—", d.postAnxiety ?? "—", d.deltaAnxiety !== null ? (d.deltaAnxiety > 0 ? `+${d.deltaAnxiety}` : d.deltaAnxiety) : "—",
        d.preEfficacy ?? "—", d.postEfficacy ?? "—", d.deltaEfficacy !== null ? (d.deltaEfficacy > 0 ? `+${d.deltaEfficacy}` : d.deltaEfficacy) : "—",
        d.postCollaboration ?? "—",
      ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pre_post_comparison_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const DeltaBadge = ({ val }) => {
    if (val === null) return <span className="text-gray-400">—</span>;
    const color = val > 0
      ? "text-green-700 bg-green-100/80"
      : val < 0
        ? "text-red-700 bg-red-100/80"
        : "text-gray-500 bg-gray-100/80";
    return (
      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
        {val > 0 ? `+${val}` : val}
      </span>
    );
  };

  const ScoreCell = ({ val, color }) => {
    if (val === null) return <span className="text-gray-400">—</span>;
    return <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg font-semibold text-sm ${color}`}>{val}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const quizStat = getCompareStat("Quiz");
  const anxietyStat = getCompareStat("Anxiety");
  const efficacyStat = getCompareStat("Efficacy");

  const getCollabStat = () => {
    const vals = participantData.filter(d => d.postCollaboration !== null && d.postCollaboration !== undefined);
    if (vals.length === 0) return { postAvg: "—", count: 0 };
    const postAvg = (vals.reduce((s, d) => s + d.postCollaboration, 0) / vals.length).toFixed(1);
    return { postAvg, count: vals.length };
  };
  const collabStat = getCollabStat();

  const statCards = [
    { label: "學習成就測驗", field: "Quiz", stat: quizStat, preColor: "text-emerald-600", postColor: "text-emerald-700", accent: "#10b981" },
    { label: "焦慮量表", field: "Anxiety", stat: anxietyStat, preColor: "text-blue-600", postColor: "text-blue-700", accent: "#3b82f6" },
    { label: "自我效能感", field: "Efficacy", stat: efficacyStat, preColor: "text-violet-600", postColor: "text-violet-700", accent: "#8b5cf6" },
  ];

  // Glass card styles
  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
    borderRadius: "16px",
  };

  const glassCardSubtle = {
    background: "rgba(255,255,255,0.60)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.80)",
    boxShadow: "0 1px 10px rgba(0,0,0,0.05)",
    borderRadius: "14px",
  };

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #f7f5ff 40%, #f0f9ff 100%)" }}
      onClick={() => setOpenDropdown(null)}
    >
      {/* Ambient blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "30%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "30%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>

      <div className="max-w-7xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="mb-4">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1.5 text-sm font-medium transition" style={{ color: "#0071e3" }}>
            <span>←</span> 返回教師看板
          </a>
        </div>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f", letterSpacing: "-0.3px" }}>前後測結果比較</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>共 {filteredParticipants.length} 位參與者</p>
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95"
            style={{
              ...glassCard,
              color: "#0071e3",
              borderRadius: 10,
            }}
          >
            ⬇ 匯出 CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            {
              key: 'class',
              label: '班級',
              count: filterClasses.length,
              options: Array.from(new Set(participants.map(p => p.class_id).filter(Boolean))),
              selected: filterClasses,
              onChange: (val, checked) => setFilterClasses(checked ? [...filterClasses, val] : filterClasses.filter(c => c !== val)),
            },
            {
              key: 'group',
              label: '組別',
              count: filterGroups.length,
              options: ["AI_Pair", "AI_Solo"],
              selected: filterGroups,
              onChange: (val, checked) => setFilterGroups(checked ? [...filterGroups, val] : filterGroups.filter(g => g !== val)),
            },
          ].map(({ key, label, count, options, selected, onChange }) => (
            <div key={key} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === key ? null : key); }}
                className="text-xs px-3.5 py-2 font-medium transition-all flex items-center gap-2"
                style={{
                  ...glassCard,
                  borderRadius: 10,
                  color: "#1d1d1f",
                  fontSize: 13,
                }}
              >
                {label} {count > 0 && <span style={{ background: "#0071e3", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{count}</span>} ▾
              </button>
              {openDropdown === key && (
                <div
                  className="absolute top-full left-0 mt-1.5 z-20 min-w-44"
                  style={{ ...glassCard, borderRadius: 12, overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}
                >
                  {options.map(opt => (
                    <label key={opt} className="flex items-center px-4 py-2.5 cursor-pointer text-sm transition-colors hover:bg-black/5" style={{ color: "#1d1d1f" }}>
                      <input type="checkbox" checked={selected.includes(opt)}
                        onChange={(e) => onChange(opt, e.target.checked)}
                        className="mr-2.5 accent-blue-500" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map(({ label, stat, preColor, postColor, accent }) => (
            <div key={label} className="p-5" style={glassCard}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
                <h3 className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>{label}</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span style={{ color: "#6e6e73" }}>前測平均</span>
                  <span className={`font-bold ${preColor}`}>{stat.preAvg}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: "#6e6e73" }}>後測平均</span>
                  <span className={`font-bold ${postColor}`}>{stat.postAvg}</span>
                </div>
                <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                  <span style={{ color: "#6e6e73" }}>平均進步</span>
                  <span className={`font-bold ${parseFloat(stat.deltaAvg) > 0 ? "text-green-600" : parseFloat(stat.deltaAvg) < 0 ? "text-red-500" : "text-gray-500"}`}>
                    {stat.deltaAvg !== "—" && parseFloat(stat.deltaAvg) > 0 ? `+${stat.deltaAvg}` : stat.deltaAvg}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: "#6e6e73" }}>有效對數</span>
                  <span className="font-bold" style={{ color: "#1d1d1f" }}>{stat.count} 人</span>
                </div>
              </div>
            </div>
          ))}
          {/* Collaboration - post only */}
          <div className="p-5" style={{ ...glassCard, border: "1px solid rgba(251,146,60,0.3)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f97316" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                協作學習知覺 <span className="text-xs font-normal ml-1" style={{ color: "#f97316" }}>後測限定</span>
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span style={{ color: "#6e6e73" }}>前測平均</span>
                <span className="font-bold text-gray-400">—</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: "#6e6e73" }}>後測平均</span>
                <span className="font-bold text-orange-500">{collabStat.postAvg}</span>
              </div>
              <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <span style={{ color: "#6e6e73" }}>平均進步</span>
                <span className="font-bold text-gray-400">—</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: "#6e6e73" }}>有效人數</span>
                <span className="font-bold" style={{ color: "#1d1d1f" }}>{collabStat.count} 人</span>
              </div>
            </div>
          </div>
        </div>

        {/* Group Comparison Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { label: "學習成就前後測比較（組別）", field: "Quiz", colors: ["#34d399", "#059669"] },
            { label: "焦慮量表前後測比較（組別）", field: "Anxiety", colors: ["#60a5fa", "#2563eb"] },
            { label: "自我效能感前後測比較（組別）", field: "Efficacy", colors: ["#c084fc", "#7c3aed"] },
          ].map(({ label, field, colors }) => (
            <div key={label} className="p-5" style={glassCard}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#1d1d1f" }}>{label}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={getGroupCompareData(field)} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ ...glassCardSubtle, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="前測" fill={colors[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="後測" fill={colors[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
          {/* Collaboration post-only chart */}
          <div className="p-5" style={{ ...glassCard, border: "1px solid rgba(251,146,60,0.3)" }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "#1d1d1f" }}>
              協作學習知覺後測（組別）<span className="text-xs font-normal ml-1" style={{ color: "#f97316" }}>後測限定</span>
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(() => {
                return ["AI_Pair", "AI_Solo"].map(g => {
                  const gData = participantData.filter(d => d.group === g && d.postCollaboration !== null && d.postCollaboration !== undefined);
                  if (gData.length === 0) return { group: g, 後測: 0 };
                  const postAvg = gData.reduce((s, d) => s + d.postCollaboration, 0) / gData.length;
                  return { group: g, 後測: parseFloat(postAvg.toFixed(1)) };
                });
              })()} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="group" tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ ...glassCardSubtle, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="後測" fill="#fb923c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Group Efficiency Panel */}
        <GroupEfficiencyPanel participantData={participantData} />

        {/* Detail Table */}
        <div className="overflow-x-auto mt-6" style={glassCard}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.07)", background: "rgba(0,0,0,0.02)" }}>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: "#1d1d1f" }} onClick={() => handleSort('participant_id')}>
                  參與者 ID <span className="text-gray-400">{getSortIcon('participant_id')}</span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: "#1d1d1f" }} onClick={() => handleSort('name')}>
                  姓名 <span className="text-gray-400">{getSortIcon('name')}</span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: "#1d1d1f" }} onClick={() => handleSort('class_id')}>
                  班級 <span className="text-gray-400">{getSortIcon('class_id')}</span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: "#1d1d1f" }} onClick={() => handleSort('group')}>
                  組別 <span className="text-gray-400">{getSortIcon('group')}</span>
                </th>
                {/* Quiz */}
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#059669", background: "rgba(16,185,129,0.06)" }} onClick={() => handleSort('preQuiz')}>
                  成就前測 <span className="text-gray-400">{getSortIcon('preQuiz')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#059669", background: "rgba(16,185,129,0.06)" }} onClick={() => handleSort('postQuiz')}>
                  成就後測 <span className="text-gray-400">{getSortIcon('postQuiz')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#059669", background: "rgba(16,185,129,0.06)" }} onClick={() => handleSort('deltaQuiz')}>
                  進步 <span className="text-gray-400">{getSortIcon('deltaQuiz')}</span>
                </th>
                {/* Anxiety */}
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#2563eb", background: "rgba(59,130,246,0.06)" }} onClick={() => handleSort('preAnxiety')}>
                  焦慮前測 <span className="text-gray-400">{getSortIcon('preAnxiety')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#2563eb", background: "rgba(59,130,246,0.06)" }} onClick={() => handleSort('postAnxiety')}>
                  焦慮後測 <span className="text-gray-400">{getSortIcon('postAnxiety')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#2563eb", background: "rgba(59,130,246,0.06)" }} onClick={() => handleSort('deltaAnxiety')}>
                  變化 <span className="text-gray-400">{getSortIcon('deltaAnxiety')}</span>
                </th>
                {/* Efficacy */}
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#7c3aed", background: "rgba(139,92,246,0.06)" }} onClick={() => handleSort('preEfficacy')}>
                  效能前測 <span className="text-gray-400">{getSortIcon('preEfficacy')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#7c3aed", background: "rgba(139,92,246,0.06)" }} onClick={() => handleSort('postEfficacy')}>
                  效能後測 <span className="text-gray-400">{getSortIcon('postEfficacy')}</span>
                </th>
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#7c3aed", background: "rgba(139,92,246,0.06)" }} onClick={() => handleSort('deltaEfficacy')}>
                  進步 <span className="text-gray-400">{getSortIcon('deltaEfficacy')}</span>
                </th>
                {/* Collaboration */}
                <th className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: "#ea580c", background: "rgba(249,115,22,0.06)" }} onClick={() => handleSort('postCollaboration')}>
                  協作知覺後測 <span className="text-gray-400">{getSortIcon('postCollaboration')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((d) => (
                <tr
                  key={d.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.025)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td className="px-4 py-3 font-medium">
                    <button
                      className="font-semibold transition-colors"
                      style={{ color: "#0071e3" }}
                      onClick={() => setSelectedStudent(d)}
                    >
                      {d.participant_id}
                    </button>
                  </td>
                  <td className="px-4 py-3" style={{ color: "#1d1d1f" }}>{d.name || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#3a3a3c" }}>{d.class_id || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium`} style={{
                      background: d.group === "AI_Pair" ? "rgba(99,102,241,0.10)" : "rgba(245,158,11,0.10)",
                      color: d.group === "AI_Pair" ? "#4f46e5" : "#b45309",
                      border: d.group === "AI_Pair" ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(245,158,11,0.25)",
                    }}>{d.group}</span>
                  </td>
                  {/* Quiz */}
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(16,185,129,0.04)" }}><ScoreCell val={d.preQuiz} color="bg-emerald-100/80 text-emerald-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(16,185,129,0.04)" }}><ScoreCell val={d.postQuiz} color="bg-green-100/80 text-green-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(16,185,129,0.04)" }}><DeltaBadge val={d.deltaQuiz} /></td>
                  {/* Anxiety */}
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(59,130,246,0.04)" }}><ScoreCell val={d.preAnxiety} color="bg-blue-100/80 text-blue-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(59,130,246,0.04)" }}><ScoreCell val={d.postAnxiety} color="bg-sky-100/80 text-sky-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(59,130,246,0.04)" }}><DeltaBadge val={d.deltaAnxiety} /></td>
                  {/* Efficacy */}
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(139,92,246,0.04)" }}><ScoreCell val={d.preEfficacy} color="bg-purple-100/80 text-purple-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(139,92,246,0.04)" }}><ScoreCell val={d.postEfficacy} color="bg-violet-100/80 text-violet-700" /></td>
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(139,92,246,0.04)" }}><DeltaBadge val={d.deltaEfficacy} /></td>
                  {/* Collaboration */}
                  <td className="px-3 py-3 text-center" style={{ background: "rgba(249,115,22,0.04)" }}><ScoreCell val={d.postCollaboration} color="bg-orange-100/80 text-orange-700" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Detail Drawer */}
      {selectedStudent && (
        <StudentDetailDrawer
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          preQuizResults={preQuizResults}
          postQuizResults={postQuizResults}
          preScaleResponses={preScaleResponses}
          postScaleResponses={postScaleResponses}
        />
      )}
    </div>
  );
}

export default function TestComparison() {
  return (
    <TeacherAuthGuard>
      <TestComparisonInner />
    </TeacherAuthGuard>
  );
}