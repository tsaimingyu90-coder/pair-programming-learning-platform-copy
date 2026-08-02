import { ISSUE_LABELS, CONFIDENCE_LABELS, ISSUE_COLORS } from "@/utils/diagnosisEngine";

function msColor(ms) {
  if (ms < 500) return "text-green-600 font-bold";
  if (ms < 1500) return "text-yellow-600 font-bold";
  return "text-red-600 font-bold";
}

export default function DiagnosisCard({ diagnosis, timeWindow, onTimeWindowChange }) {
  if (!diagnosis) return null;

  const { primary_issue, confidence, reasons, suspected_event, affected_scope, recommendation, throttlingActions, bottlenecks, slowParticipants } = diagnosis;
  const issueLabel = ISSUE_LABELS[primary_issue] || "❓ 未知";
  const confInfo = CONFIDENCE_LABELS[confidence] || CONFIDENCE_LABELS.low;
  const cardColor = ISSUE_COLORS[primary_issue] || "border-gray-200 bg-gray-50";

  return (
    <div className="space-y-4">
      {/* Time window selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-500">分析時間窗：</span>
        {[5, 10, 30, 60].map(m => (
          <button key={m} onClick={() => onTimeWindowChange(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              timeWindow === m
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}>
            最近 {m} 分鐘
          </button>
        ))}
      </div>

      {/* Main diagnosis card */}
      <div className={`rounded-2xl border-2 p-5 ${cardColor}`}>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">主要診斷</p>
            <h2 className="text-2xl font-bold text-gray-900">{issueLabel}</h2>
            {affected_scope && (
              <p className="text-sm text-gray-500 mt-1">影響範圍：{affected_scope}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${confInfo.color}`}>
              信心度：{confInfo.label}
            </span>
          </div>
        </div>

        {/* Reasons */}
        {reasons.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">📋 診斷依據</p>
            <ul className="space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Throttling-specific description */}
        {primary_issue === "network_throttling" && (
          <div className="mb-4 bg-red-100/60 rounded-xl p-4 border border-red-200">
            <p className="text-xs font-semibold text-red-600 mb-1">🔍 問題說明</p>
            <p className="text-sm text-red-800">系統判斷目前可能為「學校網路對 Base44 網域限速或連線限制」，導致多個 API 同時變慢，且全班同學均受影響。</p>
          </div>
        )}

        {/* Throttling actions */}
        {throttlingActions && throttlingActions.length > 0 && (
          <div className="bg-white/70 rounded-xl p-4 border border-white/80">
            <p className="text-xs font-semibold text-gray-500 mb-2">👉 建議行動</p>
            <ul className="space-y-1.5">
              {throttlingActions.map((a, i) => (
                <li key={i} className="text-sm font-medium text-gray-800">{a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendation */}
        {recommendation && !throttlingActions && (
          <div className="bg-white/70 rounded-xl p-4 border border-white/80">
            <p className="text-xs font-semibold text-gray-500 mb-1">👉 建議行動</p>
            <p className="text-sm font-medium text-gray-800">{recommendation}</p>
          </div>
        )}
      </div>

      {/* Bottleneck ranking */}
      {bottlenecks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">🚨 Bottleneck 排行（平均耗時由高到低）</h3>
          <div className="space-y-2">
            {bottlenecks.map((b, i) => (
              <div key={b.event} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-xs flex items-center justify-center font-bold text-gray-500">
                  {i + 1}
                </span>
                <span className="flex-1 font-mono text-xs text-gray-700">{b.event}</span>
                <span className={`text-sm ${msColor(b.avg)}`}>{b.avg}ms avg</span>
                <span className="text-xs text-gray-400">max {b.max}ms</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">{b.count} 筆</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slow participants */}
      {slowParticipants.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">👤 慢請求集中度（前 5 位）</h3>
          <div className="flex flex-wrap gap-2">
            {slowParticipants.map(({ pid, count }) => (
              <div key={pid} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="font-mono text-xs font-bold text-red-700">{pid}</span>
                <span className="text-xs text-red-500">{count} 次慢請求</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}