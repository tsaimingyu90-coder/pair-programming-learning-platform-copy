import React, { useState, useMemo, useRef, useEffect } from "react";

export default function ChatTimelineOverview({ chatLogs, participants, attempts, assignments, onParticipantSelect }) {
  const [timeGranularity, setTimeGranularity] = useState("3h"); // month, day, 12h, 6h, 3h
  const [filterDate, setFilterDate] = useState("");
  const scrollContainerRef = useRef(null);

  const timelineData = useMemo(() => {
    if (!chatLogs.length || !attempts.length) return null;

    // 計算原始時間軸範圍
    let filteredChatLogs = chatLogs;
    let filteredAttempts = attempts;

    // 如果設置了日期篩選
    if (filterDate) {
      const filterDateStart = new Date(filterDate);
      filterDateStart.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);

      filteredChatLogs = chatLogs.filter(l => {
        const ts = new Date(l.timestamp).getTime();
        return ts >= filterDateStart.getTime() && ts <= filterDateEnd.getTime();
      });
      
      filteredAttempts = attempts.filter(a => {
        const startTs = new Date(a.start_ts).getTime();
        return startTs >= filterDateStart.getTime() && startTs <= filterDateEnd.getTime();
      });
    }

    if (!filteredChatLogs.length || !filteredAttempts.length) return null;

    const allChatTimes = filteredChatLogs.map(l => new Date(l.timestamp).getTime());
    const allAttemptStarts = filteredAttempts.map(a => new Date(a.start_ts).getTime());
    const allAttemptEnds = filteredAttempts.filter(a => a.end_ts).map(a => new Date(a.end_ts).getTime());
    
    let rawMinTime = Math.min(...allChatTimes, ...allAttemptStarts);
    let rawMaxTime = Math.max(...allChatTimes, ...allAttemptEnds);
    
    // 根據時間粒度調整展示範圍
    const granularityMs = {
      month: 30 * 24 * 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "3h": 3 * 60 * 60 * 1000,
    };
    
    // 從最小時間開始計算展示窗口
    const minTime = Math.floor(rawMinTime / granularityMs[timeGranularity]) * granularityMs[timeGranularity];
    const maxTime = Math.ceil(rawMaxTime / granularityMs[timeGranularity]) * granularityMs[timeGranularity];
    const timeSpan = maxTime - minTime || 1;

    // 按參與者分組
    const logsByParticipant = {};
    filteredChatLogs.forEach(log => {
      if (!logsByParticipant[log.participant]) {
        logsByParticipant[log.participant] = [];
      }
      logsByParticipant[log.participant].push(log);
    });

    // 為每個參與者創建時間軸數據
    const timeline = Object.entries(logsByParticipant).map(([pid, logs]) => {
      const participant = participants.find(p => p.id === pid);
      const chatFirstTime = Math.min(...logs.map(l => new Date(l.timestamp).getTime()));
      const chatLastTime = Math.max(...logs.map(l => new Date(l.timestamp).getTime()));
      
      const participantAttempts = filteredAttempts
        .filter(a => a.participant === pid && a.end_ts)
        .sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts));

      const formatDateTime = (ts) => new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // 計算整體時間範圍（任務 + 對話）
      const allTimes = [chatFirstTime, chatLastTime];
      participantAttempts.forEach(att => {
        allTimes.push(new Date(att.start_ts).getTime());
        allTimes.push(new Date(att.end_ts).getTime());
      });
      const overallStart = Math.min(...allTimes);
      const overallEnd = Math.max(...allTimes);

      // 分別計算系統自動提示 vs 使用者發出的時間段
      const systemLogs = logs.filter(l => l.is_system_prompt);
      const userLogs = logs.filter(l => !l.is_system_prompt && l.role === 'user');

      const calcSystemSegments = (segLogs) => {
        if (!segLogs.length) return [];
        const sorted = segLogs.map(l => new Date(l.timestamp).getTime()).sort((a, b) => a - b);
        const GAP_THRESHOLD = 5 * 60 * 1000;
        const segments = [];
        let segStart = sorted[0];
        let segEnd = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - segEnd > GAP_THRESHOLD) {
            segments.push({ start: segStart, end: segEnd });
            segStart = sorted[i];
          }
          segEnd = sorted[i];
        }
        segments.push({ start: segStart, end: segEnd });
        return segments.map(seg => ({
          left: ((seg.start - minTime) / timeSpan) * 100,
          width: Math.max(((seg.end - seg.start) / timeSpan) * 100, 0.3),
        }));
      };

      // 使用者訊息：每則獨立判斷 - 與下一則訊息間隔 > 5 分鐘 → 條狀；否則 → 圓點
      const GAP_THRESHOLD = 5 * 60 * 1000;
      const sortedUserTimes = userLogs.map(l => new Date(l.timestamp).getTime()).sort((a, b) => a - b);
      const userDots = []; // 小黑點
      const userBars = []; // 條狀
      for (let i = 0; i < sortedUserTimes.length; i++) {
        const t = sortedUserTimes[i];
        const next = sortedUserTimes[i + 1];
        const gap = next !== undefined ? next - t : 0;
        if (next !== undefined && gap > GAP_THRESHOLD) {
          // 此訊息到下一則間隔超過5分鐘，顯示為條狀（從此訊息到下一則）
          userBars.push({
            left: ((t - minTime) / timeSpan) * 100,
            width: Math.max(((next - t) / timeSpan) * 100, 0.5),
          });
        } else {
          // 否則顯示為黑點
          userDots.push({
            left: ((t - minTime) / timeSpan) * 100,
          });
        }
      }

      return {
        participantId: pid,
        name: participant?.name || participant?.participant_id || pid,
        left: ((overallStart - minTime) / timeSpan) * 100,
        width: Math.max(((overallEnd - overallStart) / timeSpan) * 100, 0.5),
        tooltip: `${formatDateTime(overallStart)} → ${formatDateTime(overallEnd)}`,
        systemSegments: calcSystemSegments(systemLogs),
        userDots,
        userBars,
      };
    });

    return { timeline, minTime, maxTime };
  }, [chatLogs, participants, attempts, timeGranularity, filterDate]);

  const getTimelineWidth = () => {
    const granularityMs = {
      month: 30 * 24 * 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "3h": 3 * 60 * 60 * 1000,
    }[timeGranularity];

    if (!timelineData) return 100;
    const timeSpan = timelineData.maxTime - timelineData.minTime;
    const pixelsPerMs = 0.1; // 每毫秒 0.1 像素，粒度越細時間軸越寬
    return Math.max(100, (timeSpan / granularityMs) * 80); // 寬度與時間粒度成反比
  };

  // 自動滾至右邊界
  useEffect(() => {
    if (scrollContainerRef.current) {
      setTimeout(() => {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }, 50);
    }
  }, [timelineData, timeGranularity]);

  if (!timelineData) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        暫無對話紀錄
      </div>
    );
  }

  const formatTime = (ts) => {
    const date = new Date(ts);
    if (timeGranularity === "month") return date.toLocaleDateString('zh-TW', { year: '2-digit', month: '2-digit' });
    if (timeGranularity === "day") return date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
    return date.toLocaleTimeString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const generateTimeLabels = (minTime, maxTime, granularity) => {
    const labels = [];
    const timeSpan = maxTime - minTime;

    if (granularity === "12h") {
      // 每三小時顯示一次
      const intervalMs = 3 * 60 * 60 * 1000;
      let current = Math.floor(minTime / intervalMs) * intervalMs;
      
      while (current <= maxTime) {
        const position = ((current - minTime) / timeSpan) * 100;
        const date = new Date(current);
        const label = date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        labels.push({ position, label, time: current });
        current += intervalMs;
      }
    } else if (granularity === "6h") {
      // 每一小時顯示一次
      const hourMs = 60 * 60 * 1000;
      let current = Math.floor(minTime / hourMs) * hourMs;
      
      while (current <= maxTime) {
        const position = ((current - minTime) / timeSpan) * 100;
        const date = new Date(current);
        const label = date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        labels.push({ position, label, time: current });
        current += hourMs;
      }
    } else if (granularity === "3h") {
      // 每半小時顯示一次
      const halfHourMs = 30 * 60 * 1000;
      let current = Math.floor(minTime / halfHourMs) * halfHourMs;
      
      while (current <= maxTime) {
        const position = ((current - minTime) / timeSpan) * 100;
        const date = new Date(current);
        const label = date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        labels.push({ position, label, time: current });
        current += halfHourMs;
      }
    } else {
      // 對於粗粒度（month、day）
      const granularityMs = {
        month: 30 * 24 * 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
      }[granularity];

      let current = Math.floor(minTime / granularityMs) * granularityMs;

      while (current <= maxTime) {
        const position = ((current - minTime) / timeSpan) * 100;
        const date = new Date(current);
        let label = "";
        
        if (granularity === "month") {
          label = date.toLocaleDateString('zh-TW', { month: '2-digit' });
        } else if (granularity === "day") {
          label = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
        }
        
        labels.push({ position, label, time: current });
        current += granularityMs;
      }
    }

    return labels;
  };

  const { timeline, minTime, maxTime } = timelineData;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">全部學生對話時間軸</h2>
          <p className="text-xs text-gray-500 mt-0.5">共 {timelineData ? timelineData.timeline.length : 0} 位學生</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            {[
              { label: "月", value: "month" },
              { label: "日", value: "day" },
              { label: "12h", value: "12h" },
              { label: "6h", value: "6h" },
              { label: "3h", value: "3h" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimeGranularity(opt.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  timeGranularity === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 時間軸容器（支持水平滾動） */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 時間軸內容（支持水平滾動） */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-auto">
          {/* 時間軸刻度標籤 */}
          {timelineData && (
            <div className="sticky top-0 z-10 h-8 border-b border-gray-200 bg-white">
              <div className="relative h-8" style={{ width: `${getTimelineWidth()}%`, minWidth: '100%' }}>
                <div className="absolute inset-0 flex items-end px-0">
                  {generateTimeLabels(timelineData.minTime, timelineData.maxTime, timeGranularity).map((label, idx) => (
                    <div
                      key={idx}
                      className="absolute flex flex-col items-center"
                      style={{ left: `${label.position}%`, transform: 'translateX(-50%)' }}
                    >
                      <div className="w-px h-2 bg-gray-300 mb-1" />
                      <span className="text-xs text-gray-600 font-medium whitespace-nowrap">{label.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 時間軸資料列表 */}
          <div className="space-y-3 p-4 relative" style={{ width: `${getTimelineWidth()}%`, minWidth: '100%' }}>
            {/* 時間隔線 */}
            {timelineData && generateTimeLabels(timelineData.minTime, timelineData.maxTime, timeGranularity).map((label, idx) => (
              <div
                key={`gridline-${idx}`}
                className="absolute top-0 bottom-0 w-px bg-black opacity-70 pointer-events-none"
                style={{ left: `calc(${label.position}% + 1rem)` }}
              />
            ))}
            
            {timelineData && timelineData.timeline.map(item => {
              // 合併所有條狀元素並按寬度排序（越長越底層）
              const allBars = [
                ...item.userBars.map(bar => ({ ...bar, type: 'user' })),
                ...item.systemSegments.map(seg => ({ ...seg, type: 'system' })),
              ].sort((a, b) => b.width - a.width); // 長的在前（先渲染 = 底層）

              return (
                <div key={item.participantId} className="pb-3 border-b border-gray-100 last:border-b-0 relative">
                  <div className="relative h-3 bg-gray-50 rounded border border-gray-200 overflow-visible cursor-pointer group/row" onClick={() => onParticipantSelect && onParticipantSelect(item.participantId)}>
                    {/* 條狀：按寬度排序，越長越底層 */}
                    {allBars.map((bar, i) => (
                      <div
                        key={`bar-${i}`}
                        className={`absolute h-full rounded opacity-70 hover:opacity-100 transition-opacity ${
                          bar.type === 'user' ? 'bg-gray-800' : 'bg-purple-500'
                        }`}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%`, zIndex: i }}
                      />
                    ))}
                    {/* 圓點：最上層，比時間軸高度稍大 */}
                    {item.userDots.map((dot, i) => (
                      <div
                        key={`udot-${i}`}
                        className="absolute bg-black rounded-full"
                        style={{ left: `${dot.left}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '8px', height: '8px', zIndex: 100 }}
                      />
                    ))}
                    {/* Tooltip */}
                    <div className="hidden group-hover/row:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none whitespace-nowrap">
                      <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg">
                        {item.tooltip}
                      </div>
                      <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mb-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 圖例 */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-black" />
          <span className="text-gray-600">使用者訊息（≤5分鐘間隔）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-2 rounded bg-gray-800" />
          <span className="text-gray-600">使用者訊息（&gt;5分鐘間隔）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-2 rounded bg-purple-500" />
          <span className="text-gray-600">系統自動提示</span>
        </div>
      </div>
    </div>
  );
}