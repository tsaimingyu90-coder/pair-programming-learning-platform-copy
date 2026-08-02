/**
 * Auto Diagnosis Engine (Rule-Based)
 * 輸入：PerformanceLog 陣列
 * 輸出：{ primary_issue, confidence, reasons, suspected_event, affected_scope, recommendation, bottlenecks, slowParticipants }
 */

export function analyzePerformance(logs) {
  if (!logs || logs.length < 5) {
    return {
      primary_issue: "insufficient_data",
      confidence: "low",
      reasons: ["目前紀錄筆數不足（< 5 筆），無法進行診斷"],
      suspected_event: null,
      affected_scope: null,
      recommendation: "等待更多學生操作後再重新診斷",
      bottlenecks: [],
      slowParticipants: [],
    };
  }

  // ── 基本統計 ──────────────────────────────────────────
  const withDuration = logs.filter(l => l.duration_ms != null);

  // Per event stats
  const eventMap = {};
  withDuration.forEach(l => {
    if (!l.event_type) return;
    if (!eventMap[l.event_type]) eventMap[l.event_type] = { durations: [], pids: new Set(), logs: [] };
    eventMap[l.event_type].durations.push(l.duration_ms);
    if (l.participant_id) eventMap[l.event_type].pids.add(l.participant_id);
    eventMap[l.event_type].logs.push(l);
  });

  const eventStats = Object.entries(eventMap).map(([event, { durations, pids, logs: elogs }]) => ({
    event,
    avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    max: Math.max(...durations),
    min: Math.min(...durations),
    count: durations.length,
    pids,
    logs: elogs,
  })).sort((a, b) => b.avg - a.avg);

  const bottlenecks = eventStats.slice(0, 5);

  // Slow participants
  const pidMap = {};
  withDuration.filter(l => l.duration_ms > 2000 && l.participant_id).forEach(l => {
    pidMap[l.participant_id] = (pidMap[l.participant_id] || 0) + 1;
  });
  const slowParticipants = Object.entries(pidMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, count]) => ({ pid, count }));

  const totalPids = new Set(withDuration.filter(l => l.participant_id).map(l => l.participant_id)).size;
  const slowPidCount = slowParticipants.length;

  // ── Rule 0: 校園網路限流（network_throttling）─────────────────
  const slowEventsThrottle = eventStats.filter(s => s.avg > 1500);
  const slowLogsThrottle = withDuration.filter(l => l.duration_ms > 1500);

  if (slowEventsThrottle.length >= 2) {
    // Condition 2: ≥50% participants affected
    const affectedPids = new Set(slowLogsThrottle.filter(l => l.participant_id).map(l => l.participant_id));
    const affectedRatio = totalPids > 0 ? affectedPids.size / totalPids : 0;
    const majorityAffected = affectedRatio >= 0.5;

    // Condition 3: clustered within ±1 min
    const slowTimes = slowLogsThrottle.map(l => new Date(l.created_date).getTime()).sort((a, b) => a - b);
    let clustered = false;
    for (let i = 0; i < slowTimes.length - 1; i++) {
      if (slowTimes[i + 1] - slowTimes[i] < 60000) { clustered = true; break; }
    }

    // Condition 4: no single bottleneck (top not >1.8x second)
    const noSingleBottleneck = !(eventStats.length >= 2 && eventStats[0].avg > eventStats[1].avg * 1.8);

    // Network info bonus
    const networkLogs = withDuration.filter(l => l.network_downlink != null || l.network_rtt != null);
    const poorNetworkCount = networkLogs.filter(l => (l.network_downlink != null && l.network_downlink < 1) || (l.network_rtt != null && l.network_rtt > 300)).length;
    const hasNetworkSignal = networkLogs.length > 0 && poorNetworkCount / networkLogs.length >= 0.3;

    const conditionsMet = [majorityAffected, clustered, noSingleBottleneck].filter(Boolean).length;

    if (conditionsMet >= 2) {
      const confidence = (conditionsMet === 3 || (conditionsMet >= 2 && hasNetworkSignal)) ? "high" : "medium";
      const reasons = [
        `${slowEventsThrottle.length} 種 API 同時變慢（avg > 1500ms）：${slowEventsThrottle.map(s => s.event).join("、")}`,
      ];
      if (majorityAffected) reasons.push(`${affectedPids.size} 位學生受影響（佔 ${Math.round(affectedRatio * 100)}%，≥50%）`);
      if (clustered) reasons.push("慢請求集中在相近時間區間（1 分鐘內）");
      if (noSingleBottleneck) reasons.push("無單一瓶頸，各 API 均勻變慢，符合限流特徵");
      if (hasNetworkSignal) reasons.push(`網路品質偏低（${poorNetworkCount} 筆 downlink<1Mbps 或 RTT>300ms）`);

      return {
        primary_issue: "network_throttling",
        confidence,
        reasons,
        suspected_event: null,
        affected_scope: `全班（${affectedPids.size}/${totalPids} 位學生）`,
        recommendation: null,
        throttlingActions: [
          "建議 1：請使用手機熱點測試（最準確）",
          "建議 2：確認是否只有學校環境發生此問題",
          "建議 3：請資訊組檢查是否限制 *.base44.app 網域",
          "建議 4：減少同時 API 請求（已部分優化）",
        ],
        bottlenecks,
        slowParticipants,
      };
    }
  }

  // ── Rule 3: Attempt 查詢過重 ──────────────────────────
  const attemptStat = eventStats.find(s => s.event === "week_attempt_load");
  if (attemptStat && attemptStat.avg > 1500) {
    // Check meta.count
    const heavyLogs = attemptStat.logs.filter(l => {
      try { return JSON.parse(l.meta || "{}").count > 100; } catch { return false; }
    });
    if (heavyLogs.length > 0) {
      return {
        primary_issue: "attempt_heavy",
        confidence: "high",
        reasons: [
          `week_attempt_load 平均耗時 ${attemptStat.avg}ms（> 1500ms）`,
          `${heavyLogs.length} 筆紀錄 Attempt 查詢數量超過 100 筆`,
        ],
        suspected_event: "week_attempt_load",
        affected_scope: `${attemptStat.pids.size} 位學生`,
        recommendation: "將 Attempt.filter limit 從 200 降低至 50，或改為分頁載入；考慮只查最近 N 週的紀錄",
        bottlenecks,
        slowParticipants,
      };
    }
  }

  // ── Rule 1: 網路問題（多人多事件同時慢）─────────────────
  const slowEvents = eventStats.filter(s => s.avg > 1500);
  const slowLogsAll = withDuration.filter(l => l.duration_ms > 1500);

  if (slowEvents.length >= 2 && slowPidCount >= 2) {
    // Check time clustering (±1 min)
    const times = slowLogsAll.map(l => new Date(l.created_date).getTime()).sort((a, b) => a - b);
    let clustered = false;
    for (let i = 0; i < times.length - 1; i++) {
      if (times[i + 1] - times[i] < 60000) { clustered = true; break; }
    }
    if (clustered) {
      return {
        primary_issue: "network",
        confidence: "high",
        reasons: [
          `${slowEvents.length} 個不同事件同時出現慢請求（>1500ms）`,
          `${slowPidCount} 位不同學生同時發生`,
          "慢請求集中在相近時間區間（1 分鐘內）",
        ],
        suspected_event: null,
        affected_scope: `${slowPidCount} 位學生 / ${slowEvents.map(s => s.event).join(", ")}`,
        recommendation: "建議：檢查教室 Wi-Fi 或請學生改用手機熱點測試；確認學校網路是否有流量管制",
        bottlenecks,
        slowParticipants,
      };
    }
  }

  // ── Rule 2: 單一 API 瓶頸 ────────────────────────────
  if (eventStats.length >= 2) {
    const top = eventStats[0];
    const second = eventStats[1];
    if (top.avg > 1000 && top.avg > second.avg * 1.8) {
      return {
        primary_issue: "single_event_bottleneck",
        confidence: "high",
        reasons: [
          `${top.event} 平均耗時 ${top.avg}ms，遠高於其他事件（次高：${second.avg}ms）`,
          `此事件影響 ${top.pids.size} 位學生`,
        ],
        suspected_event: top.event,
        affected_scope: `${top.pids.size} 位學生`,
        recommendation: `優先優化 ${top.event}：考慮延後載入、加快 DB 查詢索引，或減少查詢筆數`,
        bottlenecks,
        slowParticipants,
      };
    }
  }

  // ── Rule 4: 少數學生問題 ─────────────────────────────
  if (slowPidCount > 0 && totalPids > 0 && slowPidCount / totalPids < 0.3) {
    const names = slowParticipants.map(s => s.pid).join("、");
    return {
      primary_issue: "client_issue",
      confidence: "medium",
      reasons: [
        `慢請求集中在 ${slowPidCount} 位學生（佔 ${Math.round(slowPidCount / totalPids * 100)}%）`,
        `受影響學生：${names}`,
        "其他學生速度正常",
      ],
      suspected_event: bottlenecks[0]?.event || null,
      affected_scope: `${slowPidCount} 位學生`,
      recommendation: `請協助 ${names} 檢查其裝置網路狀況，或改用不同 Wi-Fi / 手機熱點`,
      bottlenecks,
      slowParticipants,
    };
  }

  // ── Rule 2b: 單一瓶頸（較寬鬆）───────────────────────
  if (eventStats.length >= 1 && eventStats[0].avg > 800) {
    const top = eventStats[0];
    return {
      primary_issue: "single_event_bottleneck",
      confidence: "medium",
      reasons: [
        `${top.event} 平均耗時 ${top.avg}ms，為最慢事件`,
        `影響 ${top.pids.size} 位學生，共 ${top.count} 次`,
      ],
      suspected_event: top.event,
      affected_scope: `${top.pids.size} 位學生`,
      recommendation: `關注 ${top.event} 的載入效能，考慮加快 DB 查詢或延後非關鍵資料`,
      bottlenecks,
      slowParticipants,
    };
  }

  return {
    primary_issue: "normal",
    confidence: "high",
    reasons: ["所有事件耗時均在可接受範圍（< 800ms）", "無異常集中慢請求"],
    suspected_event: null,
    affected_scope: null,
    recommendation: "系統目前運作正常，無需介入",
    bottlenecks,
    slowParticipants,
  };
}

export const ISSUE_LABELS = {
  network_throttling: "🚧 校園網路限流（Network Throttling）",
  network: "🌐 網路問題",
  single_event_bottleneck: "⚙️ API 瓶頸",
  attempt_heavy: "📦 Attempt 查詢過重",
  client_issue: "💻 個別裝置問題",
  insufficient_data: "📊 資料不足",
  normal: "✅ 系統正常",
};

export const CONFIDENCE_LABELS = {
  high: { label: "高", color: "bg-green-100 text-green-700" },
  medium: { label: "中", color: "bg-yellow-100 text-yellow-700" },
  low: { label: "低", color: "bg-gray-100 text-gray-500" },
};

export const ISSUE_COLORS = {
  network_throttling: "border-red-400 bg-red-50",
  network: "border-red-300 bg-red-50",
  single_event_bottleneck: "border-orange-300 bg-orange-50",
  attempt_heavy: "border-purple-300 bg-purple-50",
  client_issue: "border-yellow-300 bg-yellow-50",
  insufficient_data: "border-gray-200 bg-gray-50",
  normal: "border-green-300 bg-green-50",
};