import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { analyzePerformance } from "@/utils/diagnosisEngine";
import DiagnosisCard from "@/components/DiagnosisCard";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";

const STATUS_COLORS = {
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  timeout: "bg-orange-100 text-orange-700",
};

function msColor(ms) {
  if (ms == null) return "text-gray-400";
  if (ms < 500) return "text-green-600 font-bold";
  if (ms < 2000) return "text-yellow-600 font-bold";
  return "text-red-600 font-bold";
}

function NetCell({ downlink, rtt, type }) {
  if (!downlink && !rtt) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="text-xs text-gray-600 flex flex-col gap-0.5">
      {downlink != null && <span>{downlink} Mbps</span>}
      {rtt != null && <span>RTT {rtt}ms</span>}
      {type && <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 w-fit">{type}</span>}
    </span>
  );
}

function PerformanceMonitorInner() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageFilter, setPageFilter] = useState("全部");
  const [eventFilter, setEventFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchPid, setSearchPid] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState("diagnosis"); // diagnosis | table | stats | slow
  const [timeWindow, setTimeWindow] = useState(10); // minutes
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [invalidResult, setInvalidResult] = useState(null);
  const [checkingInvalid, setCheckingInvalid] = useState(false);

  const fetchLogs = async () => {
    const data = await base44.entities.PerformanceLog.list("-created_date", 500);
    setLogs(data);
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

  useEffect(() => { fetchLogs(); checkHealth(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchLogs, 10000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const windowedLogs = useMemo(() => {
    const cutoff = Date.now() - timeWindow * 60 * 1000;
    return logs.filter(l => new Date(l.created_date).getTime() >= cutoff);
  }, [logs, timeWindow]);

  const diagnosis = useMemo(() => analyzePerformance(windowedLogs), [windowedLogs]);

  // Derived filter options
  const pages = useMemo(() => ["全部", ...new Set(logs.map(l => l.page).filter(Boolean))], [logs]);
  const eventTypes = useMemo(() => ["全部", ...new Set(logs.map(l => l.event_type).filter(Boolean)).values()].sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (pageFilter !== "全部" && l.page !== pageFilter) return false;
    if (eventFilter !== "全部" && l.event_type !== eventFilter) return false;
    if (statusFilter !== "全部" && l.status !== statusFilter) return false;
    if (searchPid && !(l.participant_id || "").includes(searchPid)) return false;
    return true;
  }), [logs, pageFilter, eventFilter, statusFilter, searchPid]);

  // Stats per event_type
  const stats = useMemo(() => {
    const map = {};
    logs.forEach(l => {
      if (!l.event_type || l.duration_ms == null) return;
      if (!map[l.event_type]) map[l.event_type] = { durations: [], errors: 0, timeouts: 0 };
      map[l.event_type].durations.push(l.duration_ms);
      if (l.status === "error") map[l.event_type].errors++;
      if (l.status === "timeout") map[l.event_type].timeouts++;
    });
    return Object.entries(map).map(([event, { durations, errors, timeouts }]) => ({
      event,
      count: durations.length,
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      max: Math.max(...durations),
      min: Math.min(...durations),
      errors,
      timeouts,
    })).sort((a, b) => b.avg - a.avg);
  }, [logs]);

  // Slow requests > 2000ms
  const slowLogs = useMemo(() =>
    logs.filter(l => l.duration_ms > 2000).sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 50),
    [logs]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">子事件效能監控</h1>
            <p className="text-sm text-gray-500 mt-0.5">精準追蹤每個 API 呼叫的耗時與狀態</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-blue-600" />
              自動更新（10s）
            </label>
            <button onClick={fetchLogs} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              重新整理
            </button>
          </div>
        </div>

        {/* Data Health Check Section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">📊 資料健康檢查</h2>
              <p className="text-sm text-gray-500 mt-0.5">偵測重複 Participant ID 與異常資料</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {healthLoading ? "🔍 檢查中..." : "🔍 檢查資料健康狀態"}
              </button>
              <button
                onClick={checkInvalid}
                disabled={checkingInvalid}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {checkingInvalid ? "檢查中..." : "🧪 無效資料偵測"}
              </button>
            </div>
          </div>

          {healthResult ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">總人數</p>
                  <p className="text-2xl font-bold text-gray-900">{healthResult.total}</p>
                </div>
                <div className={`rounded-xl p-4 border ${healthResult.duplicate_count > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <p className="text-xs text-gray-500 mb-1">重複 ID 數量</p>
                  <p className={`text-2xl font-bold ${healthResult.duplicate_count > 0 ? "text-red-600" : "text-green-600"}`}>{healthResult.duplicate_count}</p>
                </div>
                <div className={`rounded-xl p-4 border ${healthResult.invalid_count > 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                  <p className="text-xs text-gray-500 mb-1">異常資料數量</p>
                  <p className={`text-2xl font-bold ${healthResult.invalid_count > 0 ? "text-orange-600" : "text-green-600"}`}>{healthResult.invalid_count}</p>
                </div>
                <div className={`rounded-xl p-4 border ${healthResult.status === "ok" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <p className="text-xs text-gray-500 mb-1">健康狀態</p>
                  <p className={`text-lg font-bold ${healthResult.status === "ok" ? "text-green-600" : "text-red-600"}`}>{healthResult.status === "ok" ? "✓ 正常" : "⚠️ 異常"}</p>
                </div>
              </div>

              {/* Warnings */}
              {healthResult.duplicate_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
                    <span>🚨</span> 發現重複 Participant ID
                  </h3>
                  <div className="space-y-1">
                    {healthResult.duplicates.map((dup, idx) => (
                      <div key={idx} className="text-sm text-red-700 font-mono">
                        {dup.id}（出現 {dup.count} 次）
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {healthResult.invalid_count > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                    <span>⚠️</span> 異常資料記錄
                  </h3>
                  <div className="space-y-1">
                    {healthResult.invalid.slice(0, 10).map((inv, idx) => (
                      <div key={idx} className="text-sm text-orange-700 font-mono">
                        {inv.participant_id || "無 ID"} - {inv.name || "無姓名"} - {inv.class_id || "無班級"} - {inv.group || "無組別"}
                      </div>
                    ))}
                    {healthResult.invalid.length > 10 && (
                      <div className="text-xs text-orange-600 mt-2">... 還有 {healthResult.invalid.length - 10} 筆</div>
                    )}
                  </div>
                </div>
              )}

              {healthResult.status === "ok" && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-800 font-medium">✓ 所有資料正常，未發現重複或異常記錄</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              點擊上方按鈕開始檢查
            </div>
          )}
        </div>

        {/* Invalid Scale Response Detection */}
        {invalidResult && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">🧪 無效量表作答偵測</h2>
            
            {invalidResult.invalid_count === 0 ? (
              <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                <p className="text-sm text-green-800 font-medium">✓ 未發現無效作答</p>
                <p className="text-xs text-green-600 mt-1">共檢查 {invalidResult.total_checked} 筆記錄</p>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <p className="text-xs text-gray-500 mb-1">總無效數</p>
                    <p className="text-2xl font-bold text-red-600">{invalidResult.invalid_count}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <p className="text-xs text-gray-500 mb-1">焦慮量表</p>
                    <p className="text-2xl font-bold text-blue-600">{invalidResult.by_part?.anxiety?.invalid || 0}</p>
                    <p className="text-xs text-blue-600 mt-1">共 {invalidResult.by_part?.anxiety?.total || 0} 筆</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                    <p className="text-xs text-gray-500 mb-1">自我效能感</p>
                    <p className="text-2xl font-bold text-purple-600">{invalidResult.by_part?.efficacy?.invalid || 0}</p>
                    <p className="text-xs text-purple-600 mt-1">共 {invalidResult.by_part?.efficacy?.total || 0} 筆</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                    <p className="text-xs text-gray-500 mb-1">學習成就</p>
                    <p className="text-2xl font-bold text-green-600">{invalidResult.by_part?.quiz?.invalid || 0}</p>
                    <p className="text-xs text-green-600 mt-1">共 {invalidResult.by_part?.quiz?.total || 0} 筆</p>
                  </div>
                </div>

                {/* Invalid Records List */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="font-bold text-red-800 mb-2">
                    🚨 無效作答詳細名單（{invalidResult.invalid_count} 筆）
                  </h3>
                  <div className="text-sm text-red-700 mb-3">
                    總無效率：{(invalidResult.invalid_rate * 100).toFixed(1)}%
                  </div>
                  <div className="space-y-2 max-h-96 overflow-auto">
                    {invalidResult.invalid_records.map((r, i) => (
                      <div key={i} className="text-sm bg-white rounded-lg p-3 border border-red-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-500 mb-0.5">班級</span>
                            <span className="font-medium text-gray-700">{r.participant_class || "—"}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-500 mb-0.5">姓名</span>
                            <span className="font-medium text-gray-700">{r.participant_name || "—"}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-500 mb-0.5">參與者 ID</span>
                            <span className="font-mono font-bold text-blue-700">{r.participant_id_display || "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.scale_type === "anxiety" ? "bg-blue-100 text-blue-700" :
                            r.scale_type === "efficacy" ? "bg-purple-100 text-purple-700" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {r.scale_type === "anxiety" ? "焦慮量表" : r.scale_type === "efficacy" ? "自我效能感" : "學習成就"}
                          </span>
                          {r.sd && <span className="text-xs text-gray-600">SD: {r.sd}</span>}
                          {r.all_same && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">全部相同</span>}
                          {r.duration && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">{r.duration}ms</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[["diagnosis", "🔍 自動診斷"], ["table", "📋 全部紀錄"], ["stats", "📊 統計摘要"], ["slow", `🐢 慢請求 (${slowLogs.length})`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Diagnosis Tab */}
        {tab === "diagnosis" && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <DiagnosisCard
              diagnosis={diagnosis}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
            />
          </div>
        )}

        {/* Stats Tab */}
        {tab === "stats" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700">各事件平均耗時（由慢到快）</h2>
            </div>
            {stats.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">尚無資料</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["事件名稱", "筆數", "平均", "最慢", "最快", "錯誤", "Timeout"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.map(s => (
                      <tr key={s.event} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.event}</td>
                        <td className="px-4 py-3 text-gray-600">{s.count}</td>
                        <td className={`px-4 py-3 ${msColor(s.avg)}`}>{s.avg} ms</td>
                        <td className={`px-4 py-3 ${msColor(s.max)}`}>{s.max} ms</td>
                        <td className="px-4 py-3 text-green-600">{s.min} ms</td>
                        <td className="px-4 py-3">{s.errors > 0 ? <span className="text-red-600 font-bold">{s.errors}</span> : <span className="text-gray-300">0</span>}</td>
                        <td className="px-4 py-3">{s.timeouts > 0 ? <span className="text-orange-600 font-bold">{s.timeouts}</span> : <span className="text-gray-300">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Slow Tab */}
        {tab === "slow" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700">慢請求排行（耗時 &gt; 2000ms，最多 50 筆）</h2>
            </div>
            {slowLogs.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">目前無慢請求，表現良好 ✓</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["時間", "事件", "頁面", "參與者", "耗時", "狀態", "網路", "meta"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {slowLogs.map(log => (
                      <tr key={log.id} className="bg-red-50/30 hover:bg-red-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(log.created_date).toLocaleString("zh-TW")}</td>
                        <td className="px-4 py-3 font-mono text-xs text-red-700">{log.event_type}</td>
                        <td className="px-4 py-3 text-gray-600">{log.page}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.participant_id || "—"}</td>
                        <td className={`px-4 py-3 text-lg ${msColor(log.duration_ms)}`}>{log.duration_ms} ms</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-600"}`}>{log.status || "—"}</span></td>
                        <td className="px-4 py-3"><NetCell downlink={log.network_downlink} rtt={log.network_rtt} type={log.network_type} /></td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{log.meta || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table Tab */}
        {tab === "table" && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
              <select value={pageFilter} onChange={e => setPageFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {pages.map(p => <option key={p}>{p}</option>)}
              </select>
              <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-xs">
                {eventTypes.map(e => <option key={e}>{e}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {["全部", "success", "error", "timeout"].map(s => <option key={s}>{s}</option>)}
              </select>
              <input
                type="text" placeholder="搜尋參與者 ID…"
                value={searchPid} onChange={e => setSearchPid(e.target.value)}
                className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-44"
              />
              <span className="text-xs text-gray-400">{filtered.length} 筆</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">無符合資料</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["時間", "事件", "頁面", "參與者", "耗時", "狀態", "網路", "meta"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.created_date).toLocaleString("zh-TW")}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.event_type}</td>
                          <td className="px-4 py-3 text-gray-600">{log.page}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.participant_id || "—"}</td>
                          <td className="px-4 py-3">
                            {log.duration_ms != null
                              ? <span className={msColor(log.duration_ms)}>{log.duration_ms} ms</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-600"}`}>
                              {log.status || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <NetCell downlink={log.network_downlink} rtt={log.network_rtt} type={log.network_type} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate" title={log.meta}>
                            {log.meta || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PerformanceMonitor() {
  return (
    <TeacherAuthGuard>
      <PerformanceMonitorInner />
    </TeacherAuthGuard>
  );
}