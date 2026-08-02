import { useState, useEffect, useMemo, memo } from "react";
import { base44 } from "@/api/base44Client";
import { getConversationSessions } from "@/utils/sessionUtils";
import {
  buildParticipantStats,
  computeQualityStats,
  computeHeatmap,
  computeTaskStats,
  detectSuspiciousLogs,
} from "@/utils/analyticsEngine";
import { exportFullChatLogsCSV } from "@/utils/exportAnalyticsCSV";

// Components
import ChatTimelineOverview from "@/components/ChatTimelineOverview";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import KpiCards from "@/components/chatlog/KpiCards";
import BehaviorAlerts from "@/components/chatlog/BehaviorAlerts";
import QuickInsights from "@/components/chatlog/QuickInsights";
import ClassComparisonChart from "@/components/chatlog/ClassComparisonChart";
import TrendChart from "@/components/chatlog/TrendChart";
import StudentBarChart from "@/components/chatlog/StudentBarChart";
import RankingList from "@/components/chatlog/RankingList";
import ConversationQualityPanel from "@/components/chatlog/ConversationQualityPanel";
import DependencyAnalysis from "@/components/chatlog/DependencyAnalysis";
import LowQualityAlerts from "@/components/chatlog/LowQualityAlerts";
import SuspiciousPrompts from "@/components/chatlog/SuspiciousPrompts";
import TaskAnalysisPanel from "@/components/chatlog/TaskAnalysisPanel";
import TimeHeatmap from "@/components/chatlog/TimeHeatmap";
import QualityGradePanel from "@/components/chatlog/QualityGradePanel";
import ResearchExportPanel from "@/components/chatlog/ResearchExportPanel";
import { DepBadge } from "@/components/chatlog/DependencyAnalysis";
import ChatMessageBubble from "@/components/chatlog/ChatMessageBubble";

const TEST_CLASSES = ["測試班", "test", "Test"];

// ─── Sections config (for tab nav) ───────────────────────────────────────────
const SECTIONS = [
  { key: "overview",  label: "📊 總覽" },
  { key: "quality",   label: "📈 品質分析" },
  { key: "alerts",    label: "⚠️ 警示" },
  { key: "tasks",     label: "📋 任務分析" },
  { key: "heatmap",   label: "🕐 時間熱力圖" },
  { key: "export",    label: "🔬 研究匯出" },
  { key: "individual", label: "🔍 個別查詢" },
];

// ─── Glass style tokens ───────────────────────────────────────────────────────
const glass = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "16px",
};

// ─── FilterBar ────────────────────────────────────────────────────────────────
function FilterBar({ participants, filterClasses, setFilterClasses, filterGroups, setFilterGroups }) {
  const allClasses = useMemo(() => [...new Set(participants.map(p => p.class_id).filter(Boolean))], [participants]);
  const allGroups = useMemo(() => [...new Set(participants.map(p => p.group).filter(Boolean))], [participants]);
  const hasFilter = filterClasses.length > 0 || filterGroups.length > 0;
  return (
    <div className="p-3 mb-4 flex items-center gap-3 flex-wrap" style={glass}>
      <MultiSelectDropdown label="班級" options={allClasses} selected={filterClasses} onChange={setFilterClasses} />
      <MultiSelectDropdown label="組別" options={allGroups} selected={filterGroups} onChange={setFilterGroups} />
      {hasFilter && (
        <button
          onClick={() => { setFilterClasses([]); setFilterGroups([]); }}
          className="text-xs px-3 py-1.5 transition"
          style={{ background: "rgba(0,0,0,0.06)", color: "#6e6e73", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.1)" }}
        >
          清除篩選
        </button>
      )}
    </div>
  );
}

// ─── Participant list item ────────────────────────────────────────────────────
const ParticipantListItem = memo(function ParticipantListItem({ p, logCount, isActive, onClick, pStat }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 transition"
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        background: isActive ? "rgba(0,122,255,0.08)" : "transparent",
        borderLeft: isActive ? "2px solid rgba(0,122,255,0.8)" : "2px solid transparent",
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>{p.name || p.participant_id}</p>
        {pStat && <DepBadge ratio={pStat.ratio} depLevel={pStat.depLevel} />}
        {pStat?.qualityGrade && (
          <span className="text-xs px-1 py-0.5 rounded font-bold" style={
            pStat.qualityGrade === "A" ? { background: "rgba(52,199,89,0.12)", color: "#1a7f37" } :
            pStat.qualityGrade === "B" ? { background: "rgba(0,122,255,0.12)", color: "#0071e3" } :
            pStat.qualityGrade === "C" ? { background: "rgba(255,149,0,0.12)", color: "#c75000" } :
            { background: "rgba(255,59,48,0.12)", color: "#d70015" }
          }>{pStat.qualityGrade}</span>
        )}
      </div>
      <p className="text-xs mt-0.5" style={{ color: "#aeaeb2" }}>{p.participant_id}{p.class_id ? ` · ${p.class_id}` : ""} · {logCount} 則</p>
      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={
        p.group === "AI_Pair"
          ? { background: "rgba(88,86,214,0.12)", color: "#5856d6" }
          : { background: "rgba(255,149,0,0.12)", color: "#c75000" }
      }>{p.group}</span>
    </button>
  );
});

function getGradeStyle(grade) {
  if (grade === "A") return { background: "rgba(52,199,89,0.12)", color: "#1a7f37" };
  if (grade === "B") return { background: "rgba(0,122,255,0.12)", color: "#0071e3" };
  if (grade === "C") return { background: "rgba(255,149,0,0.12)", color: "#c75000" };
  return { background: "rgba(255,59,48,0.12)", color: "#d70015" };
}
function getGradeClass(grade) {
  return "text-xs px-1.5 py-0.5 rounded font-bold";
}

// ─── Main inner component ─────────────────────────────────────────────────────
function ChatLogPageInner() {
  const [participants, setParticipants] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiMetrics, setAiMetrics] = useState(null);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [selectedAttempt, setSelectedAttempt] = useState("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filterClasses, setFilterClasses] = useState(["電子一甲", "電子二甲", "電子二乙"]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [activeSection, setActiveSection] = useState("overview");
  const [messageFilter, setMessageFilter] = useState("all"); // "all" | "paired"

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, asgn, atts] = await Promise.all([
        base44.entities.Participant.list(),
        base44.entities.Assignment.list(),
        base44.entities.Attempt.list(),
      ]);
      setParticipants(p);
      setAssignments(asgn);
      setAttempts(atts);

      let allLogs = [];
      let skip = 0;
      const pageSize = 5000;
      while (true) {
        const batch = await base44.entities.ChatLog.list("-timestamp", pageSize, skip);
        allLogs.push(...batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
      }
      setChatLogs(allLogs);
      recalcMetrics(allLogs, p, filterClasses, filterGroups);
    } catch (error) {
      console.error("載入數據失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  const recalcMetrics = (allLogs, pList, classes, groups) => {
    const filteredIds = new Set(
      pList.filter(p => {
        if (classes.length > 0 && !classes.includes(p.class_id)) return false;
        if (groups.length > 0 && !groups.includes(p.group)) return false;
        return true;
      }).map(p => p.id)
    );
    const filteredLogs = allLogs.filter(l => filteredIds.has(l.participant));
    const userMessages = filteredLogs.filter(l => l.role === "user" && !l.is_system_prompt).length;
    const aiReplies = filteredLogs.filter(l => l.role === "model").length;
    const sessionCount = filteredLogs.length > 0 ? getConversationSessions(filteredLogs).length : 0;
    const registeredTotal = pList.filter(p =>
      !TEST_CLASSES.some(tc => (p.class_id || "").includes(tc))
    ).length;
    setAiMetrics({
      total_messages: filteredLogs.length,
      user_messages: userMessages,
      ai_replies: aiReplies,
      conversation_rounds: Math.min(userMessages, aiReplies),
      conversation_sessions: sessionCount,
      participantCount: new Set(filteredLogs.map(l => l.participant)).size,
      registeredTotal,
    });
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (chatLogs.length > 0 && participants.length > 0) {
      recalcMetrics(chatLogs, participants, filterClasses, filterGroups);
    }
  }, [filterClasses, filterGroups, chatLogs, participants]);

  const handleRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // ── Memoized lookups ──
  const participantMap = useMemo(() => Object.fromEntries(participants.map(p => [p.id, p])), [participants]);
  const assignmentMap = useMemo(() => Object.fromEntries(assignments.map(a => [a.id, a])), [assignments]);
  const attemptMap = useMemo(() => Object.fromEntries(attempts.map(a => [a.id, a])), [attempts]);

  const getParticipant = (id) => participantMap[id];
  const getAssignment = (id) => {
    if (!id) return null;
    return assignmentMap[id] || assignments.find(a => a.assignment_id === id);
  };
  const getAttempt = (id) => attemptMap[id];

  // ── Dashboard filter IDs ──
  const dashboardFilteredIds = useMemo(() => new Set(
    participants.filter(p => {
      if (filterClasses.length > 0 && !filterClasses.includes(p.class_id)) return false;
      if (filterGroups.length > 0 && !filterGroups.includes(p.group)) return false;
      return true;
    }).map(p => p.id)
  ), [participants, filterClasses, filterGroups]);

  // ── Analytics (heavy, memoized) ──
  const pStats = useMemo(() =>
    buildParticipantStats(participants, chatLogs, dashboardFilteredIds),
    [participants, chatLogs, dashboardFilteredIds]
  );

  const qualityStats = useMemo(() => computeQualityStats(pStats), [pStats]);
  const heatmapData = useMemo(() => computeHeatmap(chatLogs, dashboardFilteredIds), [chatLogs, dashboardFilteredIds]);
  const taskStats = useMemo(() =>
    computeTaskStats(attempts, chatLogs, assignments, dashboardFilteredIds),
    [attempts, chatLogs, assignments, dashboardFilteredIds]
  );
  const suspiciousLogs = useMemo(() =>
    detectSuspiciousLogs(chatLogs, dashboardFilteredIds),
    [chatLogs, dashboardFilteredIds]
  );

  // ── Chart data ──
  const chartData = useMemo(() =>
    pStats
      .filter(p => p.userTurns > 0)
      .map(p => ({
        name: p.name || p.participant_id || p.id,
        fullName: p.name || p.participant_id || p.id,
        class_id: p.class_id || "",
        userTurns: p.userTurns,
        modelTurns: p.modelTurns,
        total: p.userTurns + p.modelTurns,
      }))
      .sort((a, b) => b.userTurns - a.userTurns),
    [pStats]
  );

  // ── Left panel participants ──
  const activeParticipantIds = useMemo(() => new Set(chatLogs.map(l => l.participant)), [chatLogs]);
  const pStatMap = useMemo(() => Object.fromEntries(pStats.map(p => [p.id, p])), [pStats]);

  const filteredParticipants = useMemo(() =>
    participants
      .filter(p => activeParticipantIds.has(p.id))
      .filter(p => {
        if (filterClasses.length > 0 && !filterClasses.includes(p.class_id)) return false;
        if (filterGroups.length > 0 && !filterGroups.includes(p.group)) return false;
        return true;
      })
      .filter(p => !search || (p.name || "").includes(search) || (p.participant_id || "").includes(search)),
    [participants, activeParticipantIds, filterClasses, filterGroups, search]
  );

  const participantAttempts = useMemo(() =>
    selectedParticipant ? attempts.filter(a => a.participant === selectedParticipant.id) : [],
    [selectedParticipant, attempts]
  );

  const visibleLogs = useMemo(() => {
    if (!selectedParticipant) return [];
    const base = chatLogs
      .filter(l => l.participant === selectedParticipant.id)
      .filter(l => selectedAttempt === "all" || l.attempt === selectedAttempt)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (messageFilter === "paired") {
      // 只保留 user(非system_prompt) 與緊接其後的 model 成對訊息
      const paired = [];
      for (let i = 0; i < base.length; i++) {
        if (base[i].role === "user" && !base[i].is_system_prompt) {
          paired.push(base[i]);
          // 找下一則 model 訊息
          for (let j = i + 1; j < base.length; j++) {
            if (base[j].role === "model") {
              paired.push(base[j]);
              break;
            }
            if (base[j].role === "user" && !base[j].is_system_prompt) break;
          }
        }
      }
      return paired;
    }
    return base;
  }, [chatLogs, selectedParticipant, selectedAttempt, messageFilter]);

  const getAttemptLabel = (att) => {
    if (!att) return "—";
    const asgn = getAssignment(att.assignment);
    return asgn ? `${asgn.assignment_id} · ${asgn.title || ""}` : att.id?.slice(0, 8);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm" style={{ color: "#6e6e73" }}>載入對話資料中…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.25) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.2) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>
      <div className="max-w-7xl mx-auto" style={{ position: "relative", zIndex: 1 }}>

        {/* Back */}
        <div className="mb-3">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1 text-sm transition" style={{ color: "#6e6e73" }}>
            ← 返回教師看板
          </a>
        </div>

        {/* Header */}
        <div className="p-5 mb-4" style={glass}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#1d1d1f" }}>AI 對話紀錄與分析</h1>
              <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>學生 × AI 互動行為深度分析</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => exportFullChatLogsCSV({ chatLogs, participants, attempts, assignments, filteredParticipantIds: dashboardFilteredIds })}
                className="px-3 py-2 text-xs font-medium transition"
                style={{ background: "rgba(52,199,89,0.9)", color: "#fff", borderRadius: "10px" }}
              >
                ⬇ 匯出完整 CSV
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-3 py-2 text-xs font-medium transition disabled:opacity-50"
                style={{ background: "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }}
              >
                {refreshing ? "更新中…" : "↻ 即時更新"}
              </button>
            </div>
          </div>
        </div>

        {/* Filter */}
        <FilterBar
          participants={participants}
          filterClasses={filterClasses}
          setFilterClasses={setFilterClasses}
          filterGroups={filterGroups}
          setFilterGroups={setFilterGroups}
        />

        {/* Section tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition"
              style={activeSection === s.key
                ? { background: "rgba(0,0,0,0.82)", color: "#fff", borderRadius: "10px" }
                : { background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.85)", color: "#3a3a3c", borderRadius: "10px" }
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Section: Overview ── */}
        {activeSection === "overview" && (
          <>
            <KpiCards metrics={aiMetrics} stats={aiMetrics} />
            <BehaviorAlerts participants={participants} chatLogs={chatLogs} filteredIds={dashboardFilteredIds} />
            <QuickInsights participants={participants} chatLogs={chatLogs} filteredIds={dashboardFilteredIds} />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <TrendChart chatLogs={chatLogs} filteredIds={dashboardFilteredIds} />
              <ClassComparisonChart participants={participants} chatLogs={chatLogs} filteredIds={dashboardFilteredIds} />
            </div>
            {chartData.length > 0 && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <StudentBarChart chartData={chartData} />
                <RankingList chartData={chartData} />
              </div>
            )}
          </>
        )}

        {/* ── Section: Quality Analysis ── */}
        {activeSection === "quality" && (
          <>
            <ConversationQualityPanel stats={qualityStats} />
            <QualityGradePanel pStats={pStats} />
            <DependencyAnalysis pStats={pStats} />
          </>
        )}

        {/* ── Section: Alerts ── */}
        {activeSection === "alerts" && (
          <>
            <LowQualityAlerts pStats={pStats} />
            <SuspiciousPrompts suspiciousLogs={suspiciousLogs} participants={participants} />
            <BehaviorAlerts participants={participants} chatLogs={chatLogs} filteredIds={dashboardFilteredIds} />
          </>
        )}

        {/* ── Section: Task Analysis ── */}
        {activeSection === "tasks" && (
          <TaskAnalysisPanel taskStats={taskStats} />
        )}

        {/* ── Section: Time Heatmap ── */}
        {activeSection === "heatmap" && (
          <TimeHeatmap heatmapData={heatmapData} />
        )}

        {/* ── Section: Research Export ── */}
        {activeSection === "export" && (
          <ResearchExportPanel
            pStats={pStats}
            taskStats={taskStats}
            suspiciousLogs={suspiciousLogs}
            chatLogs={chatLogs}
            participants={participants}
            attempts={attempts}
            assignments={assignments}
          />
        )}

        {/* ── Section: Individual Query ── */}
        {activeSection === "individual" && (
        <div className="flex gap-4 h-[calc(100vh-160px)]">
          {/* Left panel */}
          <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden" style={glass}>
            <div className="p-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <input
                type="text"
                placeholder="搜尋學生…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm focus:outline-none"
                style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "8px", color: "#1d1d1f" }}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredParticipants.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: "#aeaeb2" }}>無對話紀錄</p>
              )}
              {filteredParticipants.map(p => {
                const logCount = chatLogs.filter(l => l.participant === p.id).length;
                return (
                  <ParticipantListItem
                    key={p.id}
                    p={p}
                    logCount={logCount}
                    isActive={selectedParticipant?.id === p.id}
                    onClick={() => { setSelectedParticipant(p); setSelectedAttempt("all"); }}
                    pStat={pStatMap[p.id]}
                  />
                );
              })}
            </div>
          </div>

          {/* Right panel: chat log */}
          <div className="flex-1 flex flex-col overflow-hidden" style={glass}>
            {!selectedParticipant ? (
              <ChatTimelineOverview
                chatLogs={chatLogs}
                participants={participants}
                attempts={attempts}
                assignments={assignments}
                onParticipantSelect={participantId => {
                  const p = participants.find(x => x.id === participantId);
                  if (p) { setSelectedParticipant(p); setSelectedAttempt("all"); }
                }}
              />
            ) : (
              <>
                {/* Sub-header */}
                <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold" style={{ color: "#1d1d1f" }}>{selectedParticipant.name || selectedParticipant.participant_id}</p>
                        {pStatMap[selectedParticipant.id] && (
                          <>
                            <DepBadge ratio={pStatMap[selectedParticipant.id].ratio} depLevel={pStatMap[selectedParticipant.id].depLevel} />
                            <span className={getGradeClass(pStatMap[selectedParticipant.id].qualityGrade)} style={getGradeStyle(pStatMap[selectedParticipant.id].qualityGrade)}>Grade {pStatMap[selectedParticipant.id].qualityGrade}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: "#6e6e73" }}>{selectedParticipant.participant_id}</span>
                        {selectedParticipant.class_id && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c" }}>{selectedParticipant.class_id}</span>
                        )}
                        {pStatMap[selectedParticipant.id] && (
                          <span className="text-xs" style={{ color: "#aeaeb2" }}>
                            {pStatMap[selectedParticipant.id].userTurns} 則 · {pStatMap[selectedParticipant.id].sessionCount} 段 · 分數 {pStatMap[selectedParticipant.id].score}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                      <select
                        value={messageFilter}
                        onChange={e => setMessageFilter(e.target.value)}
                        className="px-2 py-1 text-xs focus:outline-none"
                        style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "8px", color: "#1d1d1f" }}
                      >
                        <option value="all">篩選訊息：全部</option>
                        <option value="paired">僅成對訊息（問答）</option>
                      </select>
                      <button
                        onClick={() => setSelectedParticipant(null)}
                        className="px-3 py-1.5 text-xs font-medium transition"
                        style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3", border: "1px solid rgba(0,122,255,0.2)", borderRadius: "8px" }}
                      >
                        ← 返回時間軸
                      </button>
                      <button
                        onClick={() => {
                          const text = visibleLogs.map(log => {
                            const time = new Date(log.timestamp).toLocaleString("zh-TW");
                            const role = log.is_system_prompt ? "🤖 APP" : log.role === "user" ? "學生" : "Gemini";
                            return "[" + time + "] " + role + ":\n" + log.content + "\n";
                          }).join("\n");
                          navigator.clipboard.writeText(text);
                        }}
                        className="px-3 py-1.5 text-xs font-medium transition"
                        style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3", border: "1px solid rgba(0,122,255,0.2)", borderRadius: "8px" }}
                      >
                        📋 複製對話
                      </button>
                      <label className="text-xs" style={{ color: "#6e6e73" }}>任務：</label>
                      <select
                        value={selectedAttempt}
                        onChange={e => setSelectedAttempt(e.target.value)}
                        className="px-2 py-1 text-xs focus:outline-none"
                        style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "8px", color: "#1d1d1f" }}
                      >
                        <option value="all">全部</option>
                        {participantAttempts.map(att => (
                          <option key={att.id} value={att.id}>{getAttemptLabel(att)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {visibleLogs.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: "#aeaeb2" }}>此篩選條件下無對話紀錄</p>
                  ) : (
                    visibleLogs.map((log, idx) => {
                      const att = log.attempt ? getAttempt(log.attempt) : null;
                      const asgn = att ? getAssignment(att.assignment) : null;
                      const showLabel = idx === 0 || visibleLogs[idx - 1].attempt !== log.attempt;
                      return (
                        <div key={log.id || idx}>
                          {showLabel && asgn && (
                            <div className="text-center my-3">
                              <span className="text-xs px-3 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.06)", color: "#6e6e73" }}>
                                {asgn.assignment_id} · {asgn.title}
                              </span>
                            </div>
                          )}
                          <ChatMessageBubble log={log} />
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

export default function ChatLogPage() {
  return (
    <TeacherAuthGuard>
      <ChatLogPageInner />
    </TeacherAuthGuard>
  );
}