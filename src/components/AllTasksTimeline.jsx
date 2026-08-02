import React, { useMemo, memo, useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { getConversationSessions, getSessionActiveMinutes } from "@/utils/sessionUtils";
import { getChatStatsByParticipant } from "@/utils/chatStats";
import { loadAllClassDates, loadAllClassDatesFromDB, getClassWeekDate, getClassWeekPeriods, PERIODS } from "@/components/ClassWeekDatesModal";

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

/** Convert decimal minutes → "Xm Ys" or just "Ys" */
function fmtMinSec(decimalMinutes) {
  const totalSec = Math.round(decimalMinutes * 60);
  if (totalSec <= 0) return "—";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}秒`;
  if (s === 0) return `${m}分`;
  return `${m}分${s}秒`;
}

/** AI ratio color */
function aiRatioBg(ratio) {
  if (ratio >= 0.4) return "bg-purple-500";
  if (ratio >= 0.1) return "bg-blue-400";
  return "bg-gray-300";
}
function aiRatioText(ratio) {
  if (ratio >= 0.4) return "text-purple-700";
  if (ratio >= 0.1) return "text-blue-600";
  return "text-gray-400";
}
function aiRatioLabel(ratio) {
  if (ratio >= 0.4) return { label: "高AI使用", color: "bg-purple-100 text-purple-700 border-purple-200" };
  if (ratio >= 0.1) return { label: "正常互動", color: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "極低互動", color: "bg-gray-100 text-gray-500 border-gray-200" };
}

/** Behavior badges */
function getBehaviorTags(item) {
  const tags = [];
  const aiSec = Math.round(item.aiActiveMinutes * 60);
  const ratio = item.durationMin > 0 ? item.aiActiveMinutes / item.durationMin : 0;

  if (ratio > 0.4) tags.push({ label: "高AI使用", style: "bg-purple-100 text-purple-700 border-purple-200" });
  if (aiSec > 0 && aiSec < 30) tags.push({ label: "低互動", style: "bg-orange-100 text-orange-600 border-orange-200" });
  if (item.rounds > 8) tags.push({ label: "深層互動", style: "bg-green-100 text-green-700 border-green-200" });
  if (item.durationMin > 0 && item.durationMin < 2) tags.push({ label: "短時完成", style: "bg-yellow-100 text-yellow-700 border-yellow-200" });
  if (item.isOutsideClass) tags.push({ label: "非上課時間", style: "bg-red-100 text-red-600 border-red-200" });
  return tags;
}

// ─── Axis Helpers ─────────────────────────────────────────────────────────────

const LABEL_W = 52;   // px for task id label column
const INFO_W = 148;   // px for right info column
const MARGIN = 8;     // gap between label and axis
const GAP_PX = 14;

function parsePeriodTime(timeStr) {
  if (!timeStr) return null;
  const [s, e] = timeStr.split("~");
  if (!s || !e) return null;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return { startMin: toMin(s), endMin: toMin(e) };
}
function dateMinToTs(dateStr, minutes) {
  return new Date(dateStr + "T00:00:00").getTime() + minutes * 60 * 1000;
}
function buildClassDayAxis(dateStr, periods, availableWidth = 600) {
  const axisWidth = Math.max(availableWidth - LABEL_W - MARGIN - INFO_W - 16, 240);
  const segments = [];
  if (!periods.length || !dateStr) return segments;

  const sorted = periods
    .map(pn => {
      const info = PERIODS.find(p => p.num === pn);
      const range = info ? parsePeriodTime(info.time) : null;
      return range ? { pn, ...range, ts_start: dateMinToTs(dateStr, range.startMin), ts_end: dateMinToTs(dateStr, range.endMin) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin);

  if (!sorted.length) return segments;

  const numPeriods = sorted.length;
  const hasLeadingGap = sorted[0].startMin > 8 * 60;
  const numGaps = (hasLeadingGap ? 1 : 0) + sorted.reduce((n, p, i) => n + (sorted[i + 1]?.ts_start > p.ts_end ? 1 : 0), 0);
  const CLASS_PERIOD_PX = Math.max(60, Math.floor((axisWidth - numGaps * GAP_PX) / Math.max(numPeriods, 1)));

  const DAY_START_MIN = 8 * 60;
  if (sorted[0].startMin > DAY_START_MIN) {
    segments.push({ type: "gap", startTs: dateMinToTs(dateStr, DAY_START_MIN), endTs: sorted[0].ts_start, widthPx: GAP_PX });
  }
  sorted.forEach((p, i) => {
    segments.push({ type: "class", startTs: p.ts_start, endTs: p.ts_end, widthPx: CLASS_PERIOD_PX, pn: p.pn });
    const nextStart = sorted[i + 1]?.ts_start;
    if (nextStart && nextStart > p.ts_end) {
      segments.push({ type: "gap", startTs: p.ts_end, endTs: nextStart, widthPx: GAP_PX });
    }
  });
  return segments;
}
function tsToPx(ts, segments) {
  if (!segments.length) return null;
  let px = 0;
  for (const seg of segments) {
    if (ts <= seg.startTs) return px;
    if (ts >= seg.endTs) { px += seg.widthPx; continue; }
    return px + ((ts - seg.startTs) / (seg.endTs - seg.startTs)) * seg.widthPx;
  }
  return px;
}
function totalAxisWidth(segments) {
  return segments.reduce((sum, s) => sum + s.widthPx, 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TaskTooltip = memo(({ item }) => {
  const ratio = item.durationMin > 0 ? item.aiActiveMinutes / item.durationMin : 0;
  const ratioInfo = aiRatioLabel(ratio);
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 whitespace-nowrap shadow-xl border border-gray-700 min-w-[180px]">
      <p className="font-bold text-white mb-1.5 text-sm">{item.assignment?.assignment_id || "—"}</p>
      <div className="space-y-0.5 text-gray-300">
        <p><span className="text-gray-500">開始</span> {fmtTime(item.startTs)}</p>
        <p><span className="text-gray-500">結束</span> {fmtTime(item.endTs)}</p>
        <p><span className="text-blue-400">任務歷時</span> {fmtMinSec(item.durationMin)}</p>
      </div>
      {item.aiActiveMinutes > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5">
          <p><span className="text-purple-400">AI活動時間</span> {fmtMinSec(item.aiActiveMinutes)}</p>
          <p>
            <span className="text-purple-400">AI活動比例</span>{" "}
            <span className={`font-semibold ${aiRatioText(ratio)}`}>{Math.round(ratio * 100)}%</span>
            <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] border ${ratioInfo.color}`}>{ratioInfo.label}</span>
          </p>
        </div>
      )}
      {(item.rounds > 0 || item.userMsgs > 0) && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5 text-gray-300">
          <p><span className="text-green-400">對話輪數</span> {item.rounds}</p>
          <p><span className="text-green-400">對話段數</span> {item.sessions}</p>
          <p><span className="text-blue-300">學生訊息</span> {item.userMsgs}</p>
          <p><span className="text-purple-300">AI回覆數</span> {item.aiReplies}</p>
        </div>
      )}
      {item.isOutsideClass && (
        <p className="mt-1.5 pt-1.5 border-t border-gray-700 text-orange-400 font-medium">⚠ 非上課時間</p>
      )}
    </div>
  );
});

const TaskRow = memo(({ item, totalWidth, segments, isSimple, span, minTs, showTags }) => {
  const ratio = item.durationMin > 0 ? item.aiActiveMinutes / item.durationMin : 0;
  const ratioInfo = aiRatioLabel(ratio);
  const tags = useMemo(() => getBehaviorTags(item), [item]);
  const [tooltipPos, setTooltipPos] = useState(null);
  const barRef = useRef(null);

  let startPx, taskWidthPx, aiWidthPx;
  if (isSimple) {
    startPx = Math.max(((item.startTs - minTs) / span) * totalWidth, 0);
    taskWidthPx = Math.max(((item.endTs - item.startTs) / span) * totalWidth, 6);
    aiWidthPx = item.durationMin > 0 ? Math.min((item.aiActiveMinutes / item.durationMin) * taskWidthPx, taskWidthPx) : 0;
  } else {
    const sp = tsToPx(item.startTs, segments) ?? 0;
    const ep = tsToPx(item.endTs, segments) ?? totalWidth;
    startPx = sp;
    taskWidthPx = Math.max(ep - sp, 6);
    aiWidthPx = item.durationMin > 0 ? Math.min((item.aiActiveMinutes / item.durationMin) * taskWidthPx, taskWidthPx) : 0;
  }

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
  };
  const handleMouseLeave = () => setTooltipPos(null);

  return (
    <div className="flex items-start" style={{ marginBottom: "10px" }}>
      {/* Label */}
      <div
        className="text-xs font-bold text-gray-600 flex-shrink-0 pt-1"
        style={{ width: LABEL_W + "px", marginRight: MARGIN + "px" }}
      >
        {item.assignment?.assignment_id || "—"}
      </div>

      {/* Bars area */}
      <div className="flex-shrink-0" style={{ width: totalWidth + "px" }}>
        {/* Task bar (layer 1) */}
        <div className="relative" style={{ height: "10px", marginBottom: "3px" }}>
          {!isSimple && (
            <div className="absolute inset-0 flex">
              {segments.map((seg, i) => (
                <div key={i} style={{ width: seg.widthPx + "px", flexShrink: 0 }}
                  className={seg.type === "class" ? "bg-blue-50/80" : "bg-gray-50/60"} />
              ))}
            </div>
          )}
          <div
            ref={barRef}
            className="absolute top-0 h-full rounded-full bg-blue-300 hover:bg-blue-400 cursor-pointer transition-colors"
            style={{ left: startPx + "px", width: taskWidthPx + "px" }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
          {/* Portal tooltip — rendered into document.body to escape all overflow containers */}
          {tooltipPos && createPortal(
            <div
              className="pointer-events-none"
              style={{
                position: "fixed",
                left: tooltipPos.x,
                top: tooltipPos.y - 8,
                transform: "translate(-50%, -100%)",
                zIndex: 9999,
              }}
            >
              <TaskTooltip item={item} />
              <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
            </div>,
            document.body
          )}
        </div>

        {/* AI bar (layer 2) */}
        <div className="relative" style={{ height: "6px" }}>
          {aiWidthPx > 0 ? (
            <div
              className="absolute top-0 h-full rounded-full bg-purple-400 opacity-80 hover:opacity-100 transition-opacity"
              style={{ left: startPx + "px", width: aiWidthPx + "px" }}
            />
          ) : (
            <div className="absolute top-0 h-full" style={{ left: startPx + "px", width: Math.max(taskWidthPx, 6) + "px" }}>
              <div className="w-full h-full rounded-full bg-gray-200/60" />
            </div>
          )}
        </div>
      </div>

      {/* Right info panel */}
      <div className="flex-shrink-0 text-right pl-2" style={{ width: INFO_W + "px" }}>
        <div className="text-[10px] text-gray-500 font-mono leading-tight">
          {fmtTime(item.startTs)}–{fmtTime(item.endTs)}
          <span className="text-gray-400 ml-1">({fmtMinSec(item.durationMin)})</span>
        </div>
        {item.aiActiveMinutes > 0 && (
          <div className="text-[10px] text-purple-600 font-medium leading-tight mt-0.5">
            🤖 {fmtMinSec(item.aiActiveMinutes)}
          </div>
        )}
        {/* AI ratio progress bar */}
        {item.durationMin > 0 && item.aiActiveMinutes > 0 && (
          <div className="mt-0.5">
            <div className="flex items-center justify-end gap-1">
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${aiRatioBg(ratio)}`}
                  style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-semibold ${aiRatioText(ratio)}`}>
                {Math.round(ratio * 100)}%
              </span>
            </div>
          </div>
        )}
        {/* Behavior tags */}
        {showTags && tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5 justify-end mt-0.5">
            {tags.map((t, i) => (
              <span key={i} className={`text-[9px] px-1 py-0.5 rounded border leading-none ${t.style}`}>{t.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AllTasksTimeline({ attempts, assignments, chatLogs = [], participant, containerWidth = 800 }) {
  const [showTags, setShowTags] = React.useState(false);
  const classId = participant?.class_id;
  const [allClassDates, setAllClassDates] = useState(() => loadAllClassDates());

  useEffect(() => {
    loadAllClassDatesFromDB().then(dates => setAllClassDates(dates));
  }, []);

  const weekInfoMap = useMemo(() => {
    const map = {};
    [1, 2, 3, 4, 5, 6].forEach(w => {
      const dateStr = getClassWeekDate(allClassDates, classId, w);
      const periods = getClassWeekPeriods(allClassDates, classId, w);
      if (dateStr) map[w] = { dateStr, periods };
    });
    return map;
  }, [allClassDates, classId]);

  const dateToWeek = useMemo(() => {
    const m = {};
    Object.entries(weekInfoMap).forEach(([w, { dateStr }]) => { m[dateStr] = Number(w); });
    return m;
  }, [weekInfoMap]);

  const isInClassTime = useCallback((endTs, weekNum) => {
    if (!weekNum) return false;
    const info = weekInfoMap[weekNum];
    if (!info?.dateStr || !info.periods.length) return false;
    const d = new Date(endTs);
    const dateStr = d.toISOString().split("T")[0];
    if (dateStr !== info.dateStr) return false;
    const totalMins = d.getHours() * 60 + d.getMinutes();
    return info.periods.some(pn => {
      const pi = PERIODS.find(p => p.num === pn);
      if (!pi) return false;
      const [s, e] = pi.time.split("~");
      const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      return totalMins >= toMin(s) && totalMins <= toMin(e);
    });
  }, [weekInfoMap]);

  const getAssignmentById = useCallback((field) => {
    if (!field) return null;
    return assignments.find(a => a.id === field) || assignments.find(a => a.assignment_id === field) || null;
  }, [assignments]);

  const attemptsWithMetrics = useMemo(() => {
    return attempts
      .filter(a => a.start_ts && a.end_ts && a.assignment && getAssignmentById(a.assignment))
      .sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts))
      .map(att => {
        const asgn = getAssignmentById(att.assignment);
        const attemptLogs = participant && chatLogs
          ? chatLogs.filter(l => l.participant === participant.id && l.attempt === att.id)
          : [];

        let aiActiveMinutes = 0;
        let rounds = 0, sessions = 0, userMsgs = 0, aiReplies = 0;
        if (attemptLogs.length > 0) {
          const sess = getConversationSessions(attemptLogs);
          aiActiveMinutes = getSessionActiveMinutes(sess);
          const stats = getChatStatsByParticipant(attemptLogs, participant?.id, att.id);
          rounds = stats.conversation_rounds;
          sessions = stats.conversation_sessions;
          userMsgs = stats.user_message_count;
          aiReplies = stats.ai_reply_count;
        }

        const startTs = new Date(att.start_ts).getTime();
        const endTs = new Date(att.end_ts).getTime();
        const dateStr = new Date(att.start_ts).toISOString().split("T")[0];
        const weekNum = dateToWeek[dateStr] || null;
        const isOutsideClass = weekNum ? !isInClassTime(endTs, weekNum) : true;

        return {
          id: att.id,
          assignment: asgn,
          startTs, endTs,
          durationMin: Math.max((endTs - startTs) / 60000, 0),
          aiActiveMinutes,
          rounds, sessions, userMsgs, aiReplies,
          dateStr, weekNum, isOutsideClass,
        };
      });
  }, [attempts, assignments, participant, chatLogs, dateToWeek, isInClassTime, getAssignmentById]);

  const groups = useMemo(() => {
    const groupedMap = {};
    attemptsWithMetrics.forEach(item => {
      const key = item.weekNum ? `week_${item.weekNum}` : `date_${item.dateStr}`;
      if (!groupedMap[key]) groupedMap[key] = { key, weekNum: item.weekNum, dateStr: item.dateStr, items: [] };
      groupedMap[key].items.push(item);
    });
    return Object.values(groupedMap).sort((a, b) => {
      if (a.weekNum && b.weekNum) return a.weekNum - b.weekNum;
      if (a.weekNum) return -1;
      if (b.weekNum) return 1;
      return a.dateStr.localeCompare(b.dateStr);
    });
  }, [attemptsWithMetrics]);

  if (attemptsWithMetrics.length === 0) return null;

  const renderClassDayGroup = (group) => {
    const { items, weekNum } = group;
    const info = weekInfoMap[weekNum];
    if (!info) return renderSimpleGroup(group);
    const { dateStr, periods } = info;
    const segments = buildClassDayAxis(dateStr, periods, containerWidth);
    const totalWidth = totalAxisWidth(segments);
    if (totalWidth === 0 || segments.length === 0) return renderSimpleGroup(group);

    return (
      <div key={group.key} className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-4 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-blue-700 bg-blue-100 border border-blue-300 px-2.5 py-1 rounded-full">
            📅 W{weekNum}　{dateStr.slice(5).replace("-", "/")} 上課日
          </span>
          <span className="text-xs text-gray-400">{items.length} 個任務</span>
        </div>

        <div className="overflow-x-auto">
          {/* Period label row */}
          <div className="flex items-center mb-0.5">
            <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
            <div className="flex" style={{ width: totalWidth + "px", flexShrink: 0 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ width: seg.widthPx + "px", flexShrink: 0 }} className="text-center overflow-hidden">
                  {seg.type === "class"
                    ? <span style={{ fontSize: "10px" }} className="text-blue-500 font-semibold whitespace-nowrap">第{seg.pn}節</span>
                    : <span style={{ fontSize: "10px" }} className="text-gray-300">·</span>}
                </div>
              ))}
            </div>
            <div style={{ width: INFO_W + "px", flexShrink: 0 }} />
          </div>

          {/* Time tick row */}
          <div className="flex items-center mb-1.5">
            <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
            <div className="relative" style={{ height: "12px", width: totalWidth + "px", flexShrink: 0 }}>
              {segments.map((seg, i) => {
                if (seg.type !== "class") return null;
                const leftPx = segments.slice(0, i).reduce((s, x) => s + x.widthPx, 0);
                const nextSeg = segments[i + 1];
                const hideEndTime = nextSeg && nextSeg.type === "gap" && segments[i + 2]?.type === "class";
                return (
                  <React.Fragment key={i}>
                    <span style={{ position: "absolute", left: leftPx, fontSize: "9px", transform: "translateX(-50%)" }} className="text-gray-400 whitespace-nowrap">{fmtTime(seg.startTs)}</span>
                    {!hideEndTime && (
                      <span style={{ position: "absolute", left: leftPx + seg.widthPx, fontSize: "9px", transform: "translateX(-50%)" }} className="text-gray-400 whitespace-nowrap">{fmtTime(seg.endTs)}</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{ width: INFO_W + "px", flexShrink: 0 }} />
          </div>

          {/* Background shading bar (title axis) */}
          <div className="flex items-center mb-2">
            <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
            <div className="flex rounded overflow-hidden border border-blue-100" style={{ height: "10px", width: totalWidth + "px", flexShrink: 0 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ width: seg.widthPx + "px", flexShrink: 0 }}
                  className={seg.type === "class" ? "bg-blue-200" : "bg-gray-100"} />
              ))}
            </div>
            <div style={{ width: INFO_W + "px", flexShrink: 0 }} />
          </div>

          {/* Layer legend */}
          <div className="flex items-center mb-2 gap-3">
            <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-6 h-2 rounded-full bg-blue-300" />
                <span className="text-[9px] text-gray-400">任務歷時</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-1.5 rounded-full bg-purple-400 opacity-80" />
                <span className="text-[9px] text-gray-400">AI活動</span>
              </div>
            </div>
          </div>

          {/* Task rows */}
          <div>
            {items.map(item => (
              <TaskRow
                key={item.id}
                item={item}
                totalWidth={totalWidth}
                segments={segments}
                isSimple={false}
                showTags={showTags}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSimpleGroup = (group) => {
    const { items, weekNum, dateStr } = group;
    const minTs = Math.min(...items.map(i => i.startTs));
    const maxTs = Math.max(...items.map(i => i.endTs));
    const span = maxTs - minTs || 1;
    const isClassDay = !!weekNum;
    const label = isClassDay
      ? `W${weekNum}　${weekInfoMap[weekNum]?.dateStr?.slice(5).replace("-", "/")} 上課日（無節次設定）`
      : `${fmtDate(minTs)} 非上課日`;
    const totalWidth = Math.max(containerWidth - LABEL_W - MARGIN - INFO_W - 32, 200);

    // Build ~4 time ticks evenly across the span
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const ts = minTs + (span / tickCount) * i;
      const px = (i / tickCount) * totalWidth;
      return { ts, px };
    });

    return (
      <div key={group.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">🗒 {label}</span>
          <span className="text-xs text-gray-400">{items.length} 個任務</span>
        </div>

        {/* Time tick axis */}
        <div className="flex items-center mb-1">
          <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
          <div className="relative" style={{ height: "12px", width: totalWidth + "px", flexShrink: 0 }}>
            {ticks.map((tick, i) => (
              <span
                key={i}
                style={{ position: "absolute", left: tick.px, fontSize: "9px", transform: "translateX(-50%)" }}
                className="text-gray-400 whitespace-nowrap"
              >
                {fmtTime(tick.ts)}
              </span>
            ))}
          </div>
          <div style={{ width: INFO_W + "px", flexShrink: 0 }} />
        </div>

        {/* Background axis bar */}
        <div className="flex items-center mb-2">
          <div style={{ width: LABEL_W + "px", marginRight: MARGIN + "px", flexShrink: 0 }} />
          <div className="relative rounded overflow-hidden border border-gray-200 bg-gray-100" style={{ height: "10px", width: totalWidth + "px", flexShrink: 0 }}>
            {ticks.slice(0, -1).map((tick, i) => (
              <div
                key={i}
                style={{ position: "absolute", left: tick.px, top: 0, bottom: 0, width: "1px" }}
                className="bg-gray-300/60"
              />
            ))}
          </div>
          <div style={{ width: INFO_W + "px", flexShrink: 0 }} />
        </div>

        <div>
          {items.map(item => (
            <TaskRow
              key={item.id}
              item={item}
              totalWidth={totalWidth}
              segments={[]}
              isSimple={true}
              span={span}
              minTs={minTs}
              showTags={showTags}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0 w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">
          共 {attemptsWithMetrics.length} 個已完成任務 · 上課日依節次顯示完整時間軸，非上課日壓縮顯示
        </p>
        <button
          onClick={() => setShowTags(v => !v)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            showTags
              ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold"
              : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <span>{showTags ? "☑" : "☐"}</span>
          <span>標籤</span>
        </button>
      </div>
      <div className="space-y-3">
        {groups.map(group =>
          group.weekNum && weekInfoMap[group.weekNum]?.periods?.length > 0
            ? renderClassDayGroup(group)
            : renderSimpleGroup(group)
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-blue-100 border border-blue-200" /><span className="text-xs text-gray-400">上課節次</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-full bg-blue-300" /><span className="text-xs text-gray-400">任務歷時</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-purple-400 opacity-80" /><span className="text-xs text-gray-400">AI活動時間</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-gray-300" /><span className="text-xs text-gray-400">極低互動</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-blue-400" /><span className="text-xs text-gray-400">正常互動</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-purple-500" /><span className="text-xs text-gray-400">高AI使用</span></div>
      </div>
    </div>
  );
}