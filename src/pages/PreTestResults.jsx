import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import { getScoreSelections } from "@/utils/scoreSelections.js";
import { exportAnxietyDetailCSV, exportEfficacyDetailCSV } from "@/utils/exportDashboardCSV";

function PreTestResultsInner() {
  const [participants, setParticipants] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResponses, setScaleResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClasses, setFilterClasses] = useState(["電子一甲", "電子二甲", "電子二乙"]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [invalidResult, setInvalidResult] = useState(null);
  const [checkingInvalid, setCheckingInvalid] = useState(false);

  // Helper to check if participant has invalid responses
  const hasInvalidResponse = (participantId) => {
    if (!invalidResult) return false;
    return invalidResult.invalid_records.some(r => r.participant_id_display === participantId);
  };

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const fetchData = async () => {
    try {
      const p = await base44.entities.Participant.list();
      setParticipants(p);
    } catch (e) { console.warn("Participant fetch failed:", e); }
    await delay(1500);
    try {
      const qr = await base44.entities.QuizResult.filter({ survey_type: "pre" });
      setQuizResults(qr);
    } catch (e) { console.warn("QuizResult fetch failed:", e); }
    await delay(1500);
    try {
      const sr = await base44.entities.ScaleResponse.filter({ survey_type: "pre" });
      setScaleResponses(sr);
    } catch (e) { console.warn("ScaleResponse fetch failed:", e); }
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

  const checkInvalid = async () => {
    setCheckingInvalid(true);
    try {
      const res = await base44.functions.invoke("detectInvalidScaleResponse");
      setInvalidResult(res.data);
    } catch (err) {
      console.error("Invalid check failed:", err);
    } finally {
      setCheckingInvalid(false);
    }
  };

  useEffect(() => {
    fetchData().then(() => {
      setTimeout(() => checkHealth(), 3000);
    });
  }, []);

  const getParticipantName = (participantId) => {
    const p = participants.find(par => par.id === participantId);
    return p?.name || p?.participant_id || "—";
  };

  const getQuizScore = (participantId) => {
    const result = quizResults.find(r => r.participant === participantId && r.is_latest);
    if (!result) {
      const any = quizResults.find(r => r.participant === participantId);
      return any?.score ?? "—";
    }
    return result?.score ?? "—";
  };

  const getAnxietyScore = (participantId) => {
    const result = scaleResponses.find(r => r.participant === participantId && r.part === "anxiety" && r.is_latest);
    if (!result) {
      const any = scaleResponses.find(r => r.participant === participantId && r.part === "anxiety");
      return any?.total_score ?? "—";
    }
    return result?.total_score ?? "—";
  };

  const getEfficacyScore = (participantId) => {
    const result = scaleResponses.find(r => r.participant === participantId && r.part === "efficacy" && r.is_latest);
    if (!result) {
      const any = scaleResponses.find(r => r.participant === participantId && r.part === "efficacy");
      return any?.total_score ?? "—";
    }
    return result?.total_score ?? "—";
  };

  // Get original (first) score — finds the record with smallest version_no (or no version_no = legacy = original)
  const getQuizOriginalScore = (participantId) => {
    const all = quizResults.filter(r => r.participant === participantId);
    if (all.length === 0) return "—";
    const sorted = [...all].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    return sorted[0]?.score ?? "—";
  };
  const getAnxietyOriginalScore = (participantId) => {
    const all = scaleResponses.filter(r => r.participant === participantId && r.part === "anxiety");
    if (all.length === 0) return "—";
    const sorted = [...all].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    return sorted[0]?.total_score ?? "—";
  };
  const getEfficacyOriginalScore = (participantId) => {
    const all = scaleResponses.filter(r => r.participant === participantId && r.part === "efficacy");
    if (all.length === 0) return "—";
    const sorted = [...all].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    return sorted[0]?.total_score ?? "—";
  };

  // Get redo (latest, version_no > 1) score — only if there's actually a redo record
  const getQuizRedoScore = (participantId) => {
    const all = quizResults.filter(r => r.participant === participantId);
    if (all.length <= 1) return "—";
    const sorted = [...all].sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
    const latest = sorted[0];
    return (latest.version_no || 1) > 1 ? (latest.score ?? "—") : "—";
  };
  const getAnxietyRedoScore = (participantId) => {
    const all = scaleResponses.filter(r => r.participant === participantId && r.part === "anxiety");
    if (all.length <= 1) return "—";
    const sorted = [...all].sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
    const latest = sorted[0];
    return (latest.version_no || 1) > 1 ? (latest.total_score ?? "—") : "—";
  };
  const getEfficacyRedoScore = (participantId) => {
    const all = scaleResponses.filter(r => r.participant === participantId && r.part === "efficacy");
    if (all.length <= 1) return "—";
    const sorted = [...all].sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
    const latest = sorted[0];
    return (latest.version_no || 1) > 1 ? (latest.total_score ?? "—") : "—";
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

  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aVal, bVal;
    
    if (sortConfig.key === 'quiz') {
      aVal = getQuizScore(a.id);
      bVal = getQuizScore(b.id);
    } else if (sortConfig.key === 'anxiety') {
      aVal = getAnxietyScore(a.id);
      bVal = getAnxietyScore(b.id);
    } else if (sortConfig.key === 'efficacy') {
      aVal = getEfficacyScore(a.id);
      bVal = getEfficacyScore(b.id);
    } else {
      aVal = a[sortConfig.key];
      bVal = b[sortConfig.key];
    }
    
    // Handle missing values
    if (aVal === "—" || aVal === null || aVal === undefined) aVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;
    if (bVal === "—" || bVal === null || bVal === undefined) bVal = sortConfig.direction === 'asc' ? Infinity : -Infinity;
    
    // Numeric comparison for scores
    if (['quiz', 'anxiety', 'efficacy'].includes(sortConfig.key)) {
      aVal = Number(aVal);
      bVal = Number(bVal);
    }
    
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
    // Fetch question bank for pre test
    const questionBank = await base44.entities.QuestionBank.filter({ survey_type: "pre" });
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
        const result = quizResults.find(r => r.participant === p.id && r.is_latest) 
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
    link.download = `pre_quiz_detail_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Resolve selected score for a participant based on their StudentDetailPage selection
  const resolveSelectedPreScore = (participantDbId, allVersions, field, scoreKey) => {
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
      "學習成就前測(選定)", "學習成就前測(原始)", "學習成就前測(重做)",
      "焦慮量表(選定)", "焦慮量表(原始)", "焦慮量表(重做)",
      "自我效能感(選定)", "自我效能感(原始)", "自我效能感(重做)"
    ];
    
    const rows = [...filteredParticipants]
      .sort((a, b) => (a.student_id || "").localeCompare(b.student_id || "", undefined, { numeric: true }))
      .map(p => {
        const allQuiz = quizResults.filter(r => r.participant === p.id).sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
        const allAnxiety = scaleResponses.filter(r => r.participant === p.id && r.part === "anxiety").sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
        const allEfficacy = scaleResponses.filter(r => r.participant === p.id && r.part === "efficacy").sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
        return [
          p.student_id || "",
          p.participant_id,
          p.name || "",
          p.class_id || "",
          p.group || "",
          resolveSelectedPreScore(p.id, allQuiz, "preQuiz", "score"),
          getQuizOriginalScore(p.id),
          getQuizRedoScore(p.id),
          resolveSelectedPreScore(p.id, allAnxiety, "preAnxiety", "total_score"),
          getAnxietyOriginalScore(p.id),
          getAnxietyRedoScore(p.id),
          resolveSelectedPreScore(p.id, allEfficacy, "preEfficacy", "total_score"),
          getEfficacyOriginalScore(p.id),
          getEfficacyRedoScore(p.id),
        ];
      });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pre_test_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

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
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "8%", left: "10%", width: 450, height: 450, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.22) 0%, transparent 70%)", filter: "blur(48px)" }} />
        <div style={{ position: "absolute", bottom: "15%", right: "8%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.18) 0%, transparent 70%)", filter: "blur(48px)" }} />
      </div>
      <div className="max-w-6xl mx-auto" style={{ position: "relative", zIndex: 1 }}>
        {/* Back link */}
        <div className="mb-4">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1 text-sm transition" style={{ color: "#6e6e73" }}>
            ← 返回教師看板
          </a>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f" }}>前測結果</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>共 {filteredParticipants.length} 位參與者{filterClasses.length > 0 || filterGroups.length > 0 ? `（已篩選，全部 ${participants.length} 人）` : ""}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={checkHealth} disabled={healthLoading} className="px-4 py-2 text-sm font-medium transition flex items-center gap-2" style={healthResult?.status === "warning"
              ? { background: "rgba(255,59,48,0.1)", color: "#d70015", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "10px" }
              : { background: "rgba(0,122,255,0.1)", color: "#0071e3", border: "1px solid rgba(0,122,255,0.2)", borderRadius: "10px" }
            }>
              {healthLoading ? "🔍 檢查中..." : healthResult?.status === "warning" ? "⚠️ 發現異常" : "🔍 檢查資料健康"}
            </button>
            <button onClick={checkInvalid} disabled={checkingInvalid} className="px-4 py-2 text-sm font-medium transition flex items-center gap-2" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad", border: "1px solid rgba(175,82,222,0.2)", borderRadius: "10px" }}>
              {checkingInvalid ? "檢查中..." : "🧪 無效資料偵測"}
            </button>
            <button onClick={handleExportQuizDetail} className="px-4 py-2 text-sm transition" style={{ background: "rgba(52,199,89,0.1)", color: "#1a7f37", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
              📋 匯出學習成就作答明細
            </button>
            <button onClick={() => exportAnxietyDetailCSV({ participants: filteredParticipants, scaleResponses })} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(255,59,48,0.08)", color: "#d70015", border: "1px solid rgba(255,59,48,0.18)", borderRadius: "10px" }}>
              ⬇ 焦慮量表明細
            </button>
            <button onClick={() => exportEfficacyDetailCSV({ participants: filteredParticipants, scaleResponses })} className="px-4 py-2 text-sm font-medium transition" style={{ background: "rgba(175,82,222,0.08)", color: "#8e44ad", border: "1px solid rgba(175,82,222,0.18)", borderRadius: "10px" }}>
              ⬇ 自我效能感明細
            </button>
            <button onClick={handleExport} className="px-4 py-2 text-sm transition" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "10px" }}>
              ⬇ 匯出 CSV
            </button>
          </div>
        </div>

        {/* Health Warning Banner */}
        {healthResult?.status === "warning" && (
          <div className="p-4 mb-6" style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "14px" }}>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: "#d70015" }}>🚨 偵測到資料異常</h3>
            <div className="text-sm" style={{ color: "#d70015" }}>
              {healthResult.duplicate_count > 0 && <p className="mb-1">• 重複 Participant ID：{healthResult.duplicate_count} 組</p>}
              {healthResult.invalid_count > 0 && <p>• 異常資料記錄：{healthResult.invalid_count} 筆</p>}
              <p className="mt-2 text-xs" style={{ color: "#c0392b" }}>請前往 PerformanceMonitor 頁面查看详细資訊並處理</p>
            </div>
          </div>
        )}

        {/* Invalid Scale Response Warning */}
        {invalidResult && (
          <div className="p-4 mb-6" style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "14px" }}>
            {invalidResult.invalid_count > 0 ? (
              <>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: "#d70015" }}>🚨 發現無效量表作答</h3>
                <div className="text-sm" style={{ color: "#d70015" }}>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(0,122,255,0.1)" }}>
                      <p className="text-xs mb-0.5" style={{ color: "#0071e3" }}>焦慮量表</p>
                      <p className="text-lg font-bold" style={{ color: "#0071e3" }}>{invalidResult.by_part?.anxiety?.invalid || 0}</p>
                      <p className="text-xs" style={{ color: "#0071e3" }}>共 {invalidResult.by_part?.anxiety?.total || 0} 筆</p>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(175,82,222,0.1)" }}>
                      <p className="text-xs mb-0.5" style={{ color: "#8e44ad" }}>自我效能感</p>
                      <p className="text-lg font-bold" style={{ color: "#8e44ad" }}>{invalidResult.by_part?.efficacy?.invalid || 0}</p>
                      <p className="text-xs" style={{ color: "#8e44ad" }}>共 {invalidResult.by_part?.efficacy?.total || 0} 筆</p>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(52,199,89,0.1)" }}>
                      <p className="text-xs mb-0.5" style={{ color: "#1a7f37" }}>學習成就</p>
                      <p className="text-lg font-bold" style={{ color: "#1a7f37" }}>{invalidResult.by_part?.quiz?.invalid || 0}</p>
                      <p className="text-xs" style={{ color: "#1a7f37" }}>共 {invalidResult.by_part?.quiz?.total || 0} 筆</p>
                    </div>
                  </div>
                  <p className="mb-2">總無效作答：<span className="font-bold">{invalidResult.invalid_count}</span> 筆（{(invalidResult.invalid_rate * 100).toFixed(1)}%）</p>
                  <div className="space-y-1 max-h-96 overflow-auto">
                    {invalidResult.invalid_records.map((r, i) => (
                      <div key={i} className="text-xs rounded p-2" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,59,48,0.12)" }}>
                        <div className="grid grid-cols-3 gap-2 mb-1">
                          <div className="flex flex-col"><span className="text-[10px]" style={{ color: "#aeaeb2" }}>班級</span><span className="font-medium" style={{ color: "#3a3a3c" }}>{r.participant_class || "—"}</span></div>
                          <div className="flex flex-col"><span className="text-[10px]" style={{ color: "#aeaeb2" }}>姓名</span><span className="font-medium" style={{ color: "#3a3a3c" }}>{r.participant_name || "—"}</span></div>
                          <div className="flex flex-col"><span className="text-[10px]" style={{ color: "#aeaeb2" }}>參與者 ID</span><span className="font-mono font-bold" style={{ color: "#0071e3" }}>{r.participant_id_display || "—"}</span></div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-1" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={r.scale_type === "anxiety" ? { background: "rgba(0,122,255,0.1)", color: "#0071e3" } : r.scale_type === "efficacy" ? { background: "rgba(175,82,222,0.1)", color: "#8e44ad" } : { background: "rgba(52,199,89,0.1)", color: "#1a7f37" }}>
                            {r.scale_type === "anxiety" ? "焦慮" : r.scale_type === "efficacy" ? "自我效能" : "學習成就"}
                          </span>
                          {r.all_same && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,59,48,0.1)", color: "#d70015" }}>全部相同</span>}
                          {r.duration && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,149,0,0.1)", color: "#c75000" }}>{r.duration}ms</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-xl" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)" }}>
                <p className="text-sm font-medium" style={{ color: "#1a7f37" }}>✓ 未發現無效作答</p>
                <p className="text-xs mt-1" style={{ color: "#2ea043" }}>共檢查 {invalidResult.total_checked} 筆記錄</p>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative">
            <button onClick={() => setOpenDropdown(openDropdown === 'class' ? null : 'class')} className="text-xs px-3 py-2 font-medium transition flex items-center gap-2" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "10px", color: "#3a3a3c" }}>
              班級 {filterClasses.length > 0 && `(${filterClasses.length})`} ▼
            </button>
            {openDropdown === 'class' && (
              <div className="absolute top-full left-0 mt-1 z-10 min-w-40" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
                {Array.from(new Set(participants.map(p => p.class_id).filter(Boolean))).map(cls => (
                  <label key={cls} className="flex items-center px-4 py-2 cursor-pointer text-sm" style={{ color: "#3a3a3c" }}>
                    <input type="checkbox" checked={filterClasses.includes(cls)} onChange={(e) => setFilterClasses(e.target.checked ? [...filterClasses, cls] : filterClasses.filter(c => c !== cls))} className="mr-2" />
                    {cls}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setOpenDropdown(openDropdown === 'group' ? null : 'group')} className="text-xs px-3 py-2 font-medium transition flex items-center gap-2" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "10px", color: "#3a3a3c" }}>
              組別 {filterGroups.length > 0 && `(${filterGroups.length})`} ▼
            </button>
            {openDropdown === 'group' && (
              <div className="absolute top-full left-0 mt-1 z-10 min-w-40" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
                {["AI_Pair", "AI_Solo"].map(g => (
                  <label key={g} className="flex items-center px-4 py-2 cursor-pointer text-sm" style={{ color: "#3a3a3c" }}>
                    <input type="checkbox" checked={filterGroups.includes(g)} onChange={(e) => setFilterGroups(e.target.checked ? [...filterGroups, g] : filterGroups.filter(g2 => g2 !== g))} className="mr-2" />
                    {g}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {[
            { label: "學習成就前測", sub: "25 題", fn: getQuizScore },
            { label: "焦慮量表", sub: "11 題", fn: getAnxietyScore },
            { label: "自我效能感", sub: "16 題", fn: getEfficacyScore },
          ].map(({ label, sub, fn }) => {
            const stats = getStatistics(fn);
            return (
              <div key={label} className="p-5" style={glass}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "#6e6e73" }}>{label} <span className="text-xs font-normal ml-1" style={{ color: "#aeaeb2" }}>{sub}</span></h3>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {[
            { label: "學習成就前測分布", fn: getQuizScore, max: 100, color: "#10b981" },
            { label: "焦慮量表分布", fn: getAnxietyScore, max: 77, color: "#3b82f6" },
            { label: "自我效能感分布", fn: getEfficacyScore, max: 112, color: "#a855f7" },
          ].map(({ label, fn, max, color }) => (
            <div key={label} className="p-5" style={glass}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#6e6e73" }}>{label}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={getDistribution(fn, max)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="range" tick={{ fontSize: 12, fill: "#6e6e73" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#6e6e73" }} />
                  <Tooltip contentStyle={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "10px" }} />
                  <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden" style={glass}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.07)", background: "rgba(0,0,0,0.03)" }}>
                {[
                  { key: 'participant_id', label: '參與者 ID', align: 'left' },
                  { key: 'name', label: '姓名', align: 'left' },
                  { key: 'class_id', label: '班級', align: 'left' },
                  { key: 'group', label: '組別', align: 'left' },
                  { key: 'quiz', label: '學習成就前測', align: 'center' },
                  { key: 'anxiety', label: '焦慮量表', align: 'center' },
                  { key: 'efficacy', label: '自我效能感', align: 'center' },
                ].map(({ key, label, align }) => (
                  <th key={key} className={`text-${align} px-4 py-3 font-semibold cursor-pointer transition`} style={{ color: "#6e6e73" }} onClick={() => handleSort(key)}>
                    {label} {getSortIcon(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedParticipants.map((p) => (
                <tr key={p.id} className="transition" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td className="px-4 py-3 font-medium flex items-center gap-2" style={{ color: "#1d1d1f" }}>
                    {p.participant_id}
                    {hasInvalidResponse(p.participant_id) && (
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#3a3a3c" }}>{p.name || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#3a3a3c" }}>{p.class_id || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${p.group === "AI_Pair" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {p.group}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const score = getQuizScore(p.id);
                      const isInvalid = invalidResult?.invalid_records?.some(r => r.participant_id_display === p.participant_id && r.scale_type === "quiz");
                      return score === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : (
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm" style={{ background: "rgba(52,199,89,0.12)", color: "#1a7f37" }}>{score}</span>
                          {isInvalid && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const score = getAnxietyScore(p.id);
                      const isInvalid = invalidResult?.invalid_records?.some(r => r.participant_id_display === p.participant_id && r.scale_type === "anxiety");
                      return score === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : (
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className="inline-flex items-center justify-center w-12 h-8 rounded font-semibold text-sm" style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3" }}>{score}</span>
                          {isInvalid && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const score = getEfficacyScore(p.id);
                      const isInvalid = invalidResult?.invalid_records?.some(r => r.participant_id_display === p.participant_id && r.scale_type === "efficacy");
                      return score === "—" ? <span style={{ color: "#aeaeb2" }}>—</span> : (
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className="inline-flex items-center justify-center w-12 h-8 rounded font-semibold text-sm" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad" }}>{score}</span>
                          {isInvalid && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PreTestResults() {
  return (
    <TeacherAuthGuard>
      <PreTestResultsInner />
    </TeacherAuthGuard>
  );
}