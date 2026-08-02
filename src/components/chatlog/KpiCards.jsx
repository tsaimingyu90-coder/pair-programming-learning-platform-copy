import React from "react";

function KpiCard({ value, label, sublabel, color = "blue", large = false }) {
  const colorMap = {
    blue: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", sub: "text-blue-400" },
    purple: { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-700", sub: "text-purple-400" },
    green: { bg: "bg-green-50", border: "border-green-100", text: "text-green-700", sub: "text-green-400" },
    gray: { bg: "bg-gray-50", border: "border-gray-100", text: "text-gray-600", sub: "text-gray-400" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-xl border ${c.bg} ${c.border} ${large ? "p-5" : "p-4"} text-center flex flex-col justify-center`}>
      <p className={`font-bold ${c.text} ${large ? "text-4xl" : "text-2xl"}`}>{value ?? "—"}</p>
      <p className={`mt-1 font-semibold ${large ? "text-sm" : "text-xs"} text-gray-700`}>{label}</p>
      {sublabel && <p className={`mt-0.5 text-xs ${c.sub}`}>{sublabel}</p>}
    </div>
  );
}

export default function KpiCards({ metrics, stats }) {
  const aiUserRatio = metrics?.user_messages > 0
    ? (metrics.ai_replies / metrics.user_messages).toFixed(2)
    : "—";
  const avgInteractions = metrics?.participantCount > 0
    ? Math.round((metrics.user_messages / metrics.participantCount) * 10) / 10
    : "—";

  return (
    <div className="space-y-3 mb-4">
      {/* Row 1: Core KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          value={stats?.registeredTotal ?? "—"}
          label="學生總數"
          sublabel="不含測試班級"
          color="blue"
          large
        />
        <KpiCard
          value={metrics?.participantCount ?? "—"}
          label="AI 使用學生數"
          sublabel="有對話紀錄"
          color="purple"
          large
        />
        <KpiCard
          value={metrics?.ai_replies ?? "—"}
          label="AI 回覆數"
          sublabel="model 角色訊息"
          color="purple"
          large
        />
        <KpiCard
          value={metrics?.conversation_sessions ?? "—"}
          label="對話段數（總計）"
          sublabel="間隔 &lt; 5 分鐘為一段"
          color="green"
          large
        />
      </div>

      {/* Row 2: Quality KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          value={metrics?.user_messages ?? "—"}
          label="使用者訊息數"
          sublabel="排除系統提示"
          color="gray"
        />
        <KpiCard
          value={metrics?.conversation_rounds ?? "—"}
          label="對話輪數"
          sublabel="min(user, model)"
          color="gray"
        />
        <KpiCard
          value={avgInteractions}
          label="平均每人互動數"
          sublabel="使用者訊息 / 使用學生"
          color="gray"
        />
        <KpiCard
          value={aiUserRatio}
          label="AI / User 比率"
          sublabel="AI 回覆 / 使用者訊息"
          color="gray"
        />
      </div>
    </div>
  );
}