import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import { getScoreSelections } from "@/utils/scoreSelections.js";
import { exportAnxietyDetailCSV, exportEfficacyDetailCSV, exportCollaborationDetailCSV } from "@/utils/exportDashboardCSV";

function PostTestPageInner() {
  const [participants, setParticipants] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResponses, setScaleResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClasses, setFilterClasses] = useState(["電子一甲", "電子二甲", "電子二乙"]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchData = async () => {
    const [p, qr, sr] = await Promise.all([
      base44.entities.Participant.list(),
      base44.entities.QuizResult.filter({ survey_type: "post" }),
      base44.entities.ScaleResponse.filter({ survey_type: "post" }),
    ]);
    setParticipants(p);
    setQuizResults(qr);
    setScaleResponses(sr);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getQuizScore = (participantId) => {
    const result = quizResults.find(r => r.participant === participantId && r.is_latest !== false);
    if (!result) {
      const all = quizResults.filter(r => r.participant === participantId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return all[0]?.score ?? "—";
    }
    return result?.score ?? "—";
  };

  // Returns { original, latest } — original = is_original true, latest = is_latest true (may differ if redo)
  const getQuizBoth = (participantId) => {
    const all = quizResults.filter(r => r.participant === participantId);
    const original = all.find(r => r.is_original === true) ?? all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
    const latest = all.find(r => r.is_latest !== false) ?? all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const isRedo = original && latest && original.id !== latest.id;
    return {
      original: original?.score ?? "—",
      latest: isRedo ? (latest?.score ?? "—") : "—",
    };
  };

  const getAnxietyScore = (participantId) => {
    const result = scaleResponses.find(r => r.participant === participantId && r.part === "anxiety" && r.is_latest !== false);
    if (!result) {
      const all = scaleResponses.filter(r => r.participant === participantId && r.part === "anxiety").sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return all[0]?.total_score ?? "—";
    }
    return result?.total_score ?? "—";
  };

  const getScaleBoth = (participantId, part) => {
    const all = scaleResponses.filter(r => r.participant === participantId && r.part === part);
    const original = all.find(r => r.is_original === true) ?? all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
    const latest = all.find(r => r.is_latest !== false) ?? all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const isRedo = original && latest && original.id !== latest.id;
    return {
      original: original?.total_score ?? "—",
      latest: isRedo ? (latest?.total_score ?? "—") : "—",
    };
  };

  const getEfficacyScore = (participantId) => {
    const result = scaleResponses.find(r => r.participant === participantId && r.part === "efficacy" && r.is_latest !== false);
    if (!result) {
      const all = scaleResponses.filter(r => r.participant === participantId && r.part === "efficacy").sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return all[0]?.total_score ?? "—";
    }
    return result?.total_score ?? "—";
  };

  const getCollaborationScore = (participantId) => {
    const result = scaleResponses.find(r => r.participant === participantId && r.part === "collaboration" && r.is_latest !== false);
    if (!result) {
      const all = scaleResponses.filter(r => r.participant === participantId && r.part === "collaboration").sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return all[0]?.total_score ?? "—";
    }
    return result?.total_score ?? "—";
  };

  const filteredParticipants = participants
    .filter(p => filterClasses.length === 0 || filterClasses.includes(p.class_id))
    .filter(p => filterGroups.length === 0 || filterGroups.includes(p.group));

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

  const getScoreFn = (key) => {
    if (key === 'quiz') return getQuizScore;
    if (key === 'anxiety') return getAnxietyScore;
    if (key === 'efficacy') return getEfficacyScore;
    if (key === 'collaboration') return getCollaborationScore;
    return null;
  };

  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const fn = getScoreFn(sortConfig.key);
    let aVal = fn ? fn(a.id) : a[sortConfig.key];
    let bVal = fn ? fn(b.id) : b[sortConfig.key];

    if (aVal === "—" || aVal === null || aVal === undefined) aVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;
    if (bVal === "—" || bVal === null || bVal === undefined) bVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;

    if (fn) { aVal = Number(aVal); bVal = Number(bVal); }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getStatistics = (scoreFn) => {
    const scores = filteredParticipants.map(p => scoreFn(p.id)).filter(s => s !== "—").map(Number);
    if (scores.length === 0) return { avg: 0, max: 0, min: 0, count: 0 };
    return {
      avg: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
      max: Math.max(...scores),
      min: Math.min(...scores),
      count: scores.length
    };
  };

  const getDistribution = (scoreFn, maxScore) => {
    const scores = filteredParticipants.map(p => scoreFn(p.id)).filter(s => s !== "—").map(Number);
    const bins = {};
    for (let i = 0; i <= maxScore; i += 10) {
      const end = Math.min(i + 9, maxScore);
      bins[`${i}-${end}`] = 0;
    }
    scores.forEach(score => {
      const binKey = Object.keys(bins).find(key => {
        const [min, max] = key.split('-').map(Number);
        return score >= min && score <= max;
      });
      if (binKey) bins[binKey]++;
    });
    return Object.entries(bins).map(([range, count]) => ({ range, count }));
  };

  const handleExportQuizDetail = async () => {
    const questionBank = await base44.entities.QuestionBank.filter({ survey_type: "post" });
    const sortedQs = [...questionBank].sort((a, b) => a.questionNumber - b.questionNumber);
    const numQ = sortedQs.length || 25;

    const qHeaders = [];
    for (let i = 1; i <= numQ; i++) {
      qHeaders.push(`Q${i}_作答`, `Q${i}_正解`, `Q${i}_答對`);
    }
    const headers = ["學號", "參與者ID", "姓名", "班級", "組別", "總分", ...qHeaders];

    const rows = [...filteredParticipants]
      .sort((a, b) => (a.student_id || "").localeCompare(b.student_id || "", undefined, { numeric: true }))
      .map(p => {
        const result = quizResults.find(r => r.participant === p.id && r.is_latest !== false)
          || quizResults.filter(r => r.participant === p.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const answers = result?.answers || {};
        const score = result?.score ?? "—";
        const qCells = sortedQs.map(q => {
          const idx = q.questionNumber;
          const selected = answers[idx] ?? answers[String(idx)] ?? "—";
          const correct = q.correctAnswer || "—";
          const isCorrect = selected !== "—" ? (selected === correct ? "○" : "✗") : "—";
          return [selected, correct, isCorrect];
        }).flat();
        return [p.student_id || "", p.participant_id, p.name || "", p.class_id || "", p.group || "", score, ...qCells];
      });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `post_quiz_detail_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const resolveSelectedPostScore = (participantDbId, allVersions, field, scoreKey) => {
    if (!allVersions || allVersions.length === 0) return "—";
    const sorted = [...allVersions].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    const selections = getScoreSelections(participantDbId);
    const choice = selections[field] || "latest";
    const chosen = choice === "original" ? sorted[0] : sorted[sorted.length - 1];
    return chosen?.[scoreKey] ?? "—";
  };

  const handleExport = () => {
    const headers = [
      "學號", "參與者ID", "姓名", "班級", "組別",
      "學習成就後測(選定)", "學習成就後測(原始)", "學習成就後測(重做)",
      "焦慮量表(選定)", "焦慮量表(原始)", "焦慮量表(重做)",
      "自我效能感(選定)", "自我效能感(原始)", "自我效能感(重做)",
      "合作量表(選定)", "合作量表(原始)", "合作量表(重做)",
    ];
    const sortedForExport = [...filteredParticipants].sort((a, b) =>
      (a.student_id || "").localeCompare(b.student_id || "", undefined, { numeric: true })
    );
    const rows = sortedForExport.map(p => {
      const quiz = getQuizBoth(p.id);
      const anxiety = getScaleBoth(p.id, "anxiety");
      const efficacy = getScaleBoth(p.id, "efficacy");
      const collab = getScaleBoth(p.id, "collaboration");
      const allPostQuiz = quizResults.filter(r => r.participant === p.id).sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
      const allPostAnxiety = scaleResponses.filter(r => r.participant === p.id && r.part === "anxiety").sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
      const allPostEfficacy = scaleResponses.filter(r => r.participant === p.id && r.part === "efficacy").sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
      const allPostCollab = scaleResponses.filter(r => r.participant === p.id && r.part === "collaboration").sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
      return [
        p.student_id || "",
        p.participant_id,
        p.name || "",
        p.class_id || "",
        p.group || "",
        resolveSelectedPostScore(p.id, allPostQuiz, "postQuiz", "score"),
        quiz.original, quiz.latest,
        resolveSelectedPostScore(p.id, allPostAnxiety, "postAnxiety", "total_score"),
        anxiety.original, anxiety.latest,
        resolveSelectedPostScore(p.id, allPostEfficacy, "postEfficacy", "total_score"),
        efficacy.original, efficacy.latest,
        resolveSelectedPostScore(p.id, allPostCollab, "postCollab", "total_score"),
        collab.original, collab.latest,
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `post_test_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const statCards = [
    { label: "學習成就後測", sub: "25 題", fn: getQuizScore, color: "text-green-600", bg: "bg-green-100 text-green-700" },
    { label: "焦慮量表", sub: "11 題", fn: getAnxietyScore, color: "text-blue-600", bg: "bg-blue-100 text-blue-700" },
    { label: "自我效能感", sub: "16 題", fn: getEfficacyScore, color: "text-purple-600", bg: "bg-purple-100 text-purple-700" },
    { label: "合作量表", sub: "", fn: getCollaborationScore, color: "text-orange-600", bg: "bg-orange-100 text-orange-700" },
  ];

  const chartConfigs = [
    { label: "學習成就後測分布", fn: getQuizScore, maxScore: 100, fill: "#10b981" },
    { label: "焦慮量表分布", fn: getAnxietyScore, maxScore: 77, fill: "#3b82f6" },
    { label: "自我效能感分布", fn: getEfficacyScore, maxScore: 112, fill: "#a855f7" },
    { label: "合作量表分布", fn: getCollaborationScore, maxScore: 70, fill: "#f97316" },
  ];

  const glass = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.85)",
    borderRadius: "16px",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }}>
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }} onClick={() => setOpenDropdown(null)}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "8%", left: "10%", width: 450, height: 450, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.22) 0%, transparent 70%)", filter: "blur(48px)" }} />
        <div style={{ position: "absolute", bottom: "15%", right: "8%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.18) 0%, transparent 70%)", filter: "blur(48px)" }} />
      </div>
      <div className="max-w-7xl mx-auto" style={{ position: "relative", zIndex: 1 }}>
        {/* Back */}
        <div className="mb-4">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1 text-sm transition" style={{ color: "#6e6e73" }}>← 返回教師看板</a>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f" }}>後測結果</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>
              共 {filteredParticipants.length} 位參與者
              {(filterClasses.length > 0 || filterGroups.length > 0) ? `（已篩選，全部 ${participants.length} 人）` : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExportQuizDetail} className="px-4 py-2 text-sm transition" style={{ background: "rgba(52,199,89,0.1)", color: "#1a7f37", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
              📋 匯出學習成就作答明細
            </button>
            <button onClick={() => exportAnxietyDetailCSV({ participants: filteredParticipants, scaleResponses, surveyType: "post" })} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(255,59,48,0.08)", color: "#d70015", border: "1px solid rgba(255,59,48,0.18)", borderRadius: "10px" }}>
              ⬇ 焦慮量表明細
            </button>
            <button onClick={() => exportEfficacyDetailCSV({ participants: filteredParticipants, scaleResponses, surveyType: "post" })} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(175,82,222,0.08)", color: "#8e44ad", border: "1px solid rgba(175,82,222,0.18)", borderRadius: "10px" }}>
              ⬇ 自我效能感明細
            </button>
            <button onClick={() => exportCollaborationDetailCSV({ participants: filteredParticipants, scaleResponses, surveyType: "post" })} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(255,149,0,0.08)", color: "#c75000", border: "1px solid rgba(255,149,0,0.2)", borderRadius: "10px" }}>
              ⬇ 協作學習知覺明細
            </button>
            <button onClick={handleExport} className="px-4 py-2 text-sm transition" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "10px" }}>
              ⬇ 匯出 CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { id: 'class', label: '班級', count: filterClasses.length, options: Array.from(new Set(participants.map(p => p.class_id).filter(Boolean))), checked: (v) => filterClasses.includes(v), toggle: (v, checked) => setFilterClasses(checked ? [...filterClasses, v] : filterClasses.filter(c => c !== v)) },
            { id: 'group', label: '組別', count: filterGroups.length, options: ["AI_Pair", "AI_Solo"], checked: (v) => filterGroups.includes(v), toggle: (v, checked) => setFilterGroups(checked ? [...filterGroups, v] : filterGroups.filter(g => g !== v)) },
          ].map(({ id, label, count, options, checked, toggle }) => (
            <div key={id} className="relative">
              <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === id ? null : id); }} className="text-xs px-3 py-2 font-medium transition flex items-center gap-2" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "10px", color: "#3a3a3c" }}>
                {label} {count > 0 && `(${count})`} ▼
              </button>
              {openDropdown === id && (
                <div className="absolute top-full left-0 mt-1 z-10 min-w-40" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
                  {options.map(v => (
                    <label key={v} className="flex items-center px-4 py-2 cursor-pointer text-sm" style={{ color: "#3a3a3c" }}>
                      <input type="checkbox" checked={checked(v)} onChange={(e) => toggle(v, e.target.checked)} className="mr-2" />
                      {v}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map(({ label, sub, fn }) => {
            const stats = getStatistics(fn);
            return (
              <div key={label} className="p-5" style={glass}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "#6e6e73" }}>
                  {label} {sub && <span className="text-xs font-normal ml-1" style={{ color: "#aeaeb2" }}>{sub}</span>}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span style={{ color: "#6e6e73" }}>平均分數</span><span className="font-bold" style={{ color: "#34c759" }}>{stats.avg}</span></div>
                  <div className="flex justify-between"><span style={{ color: "#6e6e73" }}>最高分</span><span className="font-bold" style={{ color: "#0071e3" }}>{stats.max}</span></div>
                  <div className="flex justify-between"><span style={{ color: "#6e6e73" }}>最低分</span><span className="font-bold" style={{ color: "#ff3b30" }}>{stats.min}</span></div>
                  <div className="flex justify-between"><span style={{ color: "#6e6e73" }}>完成人數</span><span className="font-bold" style={{ color: "#1d1d1f" }}>{stats.count} 人</span></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {chartConfigs.map(({ label, fn, maxScore, fill }) => (
            <div key={label} className="p-5" style={glass}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#6e6e73" }}>{label}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={getDistribution(fn, maxScore)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#6e6e73" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#6e6e73" }} />
                  <Tooltip contentStyle={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "10px" }} />
                  <Bar dataKey="count" fill={fill} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto" style={glass}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.07)", background: "rgba(0,0,0,0.03)" }}>
                {[
                  { key: 'participant_id', label: '參與者 ID', center: false },
                  { key: 'name', label: '姓名', center: false },
                  { key: 'class_id', label: '班級', center: false },
                  { key: 'group', label: '組別', center: false },
                  { key: 'quiz', label: '學習成就後測', center: true },
                  { key: 'anxiety', label: '焦慮量表', center: true },
                  { key: 'efficacy', label: '自我效能感', center: true },
                  { key: 'collaboration', label: '合作量表', center: true },
                ].map(({ key, label, center }) => (
                  <th key={key} className={`px-4 py-3 font-semibold cursor-pointer transition ${center ? 'text-center' : 'text-left'}`} style={{ color: "#6e6e73" }} onClick={() => handleSort(key)}>
                    {label} {getSortIcon(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedParticipants.map((p) => {
                const quiz = getQuizScore(p.id);
                const anxiety = getAnxietyScore(p.id);
                const efficacy = getEfficacyScore(p.id);
                const collab = getCollaborationScore(p.id);
                return (
                  <tr key={p.id} className="transition" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: "#1d1d1f" }}>{p.participant_id}</td>
                    <td className="px-4 py-3" style={{ color: "#3a3a3c" }}>{p.name || "—"}</td>
                    <td className="px-4 py-3" style={{ color: "#3a3a3c" }}>{p.class_id || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${p.group === "AI_Pair" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {p.group}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {quiz === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : <span className="inline-flex items-center justify-center w-10 h-8 rounded-full font-semibold text-sm" style={{ background: "rgba(52,199,89,0.12)", color: "#1a7f37" }}>{quiz}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {anxiety === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : <span className="inline-flex items-center justify-center w-12 h-8 rounded font-semibold text-sm" style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3" }}>{anxiety}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {efficacy === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : <span className="inline-flex items-center justify-center w-12 h-8 rounded font-semibold text-sm" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad" }}>{efficacy}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {collab === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : <span className="inline-flex items-center justify-center w-12 h-8 rounded font-semibold text-sm" style={{ background: "rgba(255,149,0,0.1)", color: "#c75000" }}>{collab}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PostTestPage() {
  return (
    <TeacherAuthGuard>
      <PostTestPageInner />
    </TeacherAuthGuard>
  );
}