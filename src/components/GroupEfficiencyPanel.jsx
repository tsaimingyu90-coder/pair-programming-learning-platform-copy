import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine, Cell,
} from "recharts";
import { welchTTest, sigLevel } from "@/utils/ttest";

const GROUPS = ["AI_Pair", "AI_Solo"];
const PAIR_COLOR = "#6366f1";
const SOLO_COLOR = "#f59e0b";

function getGroupValues(data, group, field) {
  return data
    .filter(d => d.group === group && d[field] !== null && d[field] !== undefined)
    .map(d => d[field]);
}

function getGroupStats(data, group, preField, postField, deltaField) {
  const vals = data.filter(d => d.group === group && d[preField] !== null && d[postField] !== null);
  if (vals.length === 0) return { pre: null, post: null, delta: null, count: 0 };
  const pre = vals.reduce((s, d) => s + d[preField], 0) / vals.length;
  const post = vals.reduce((s, d) => s + d[postField], 0) / vals.length;
  const delta = vals.reduce((s, d) => s + d[deltaField], 0) / vals.length;
  return {
    pre: parseFloat(pre.toFixed(1)),
    post: parseFloat(post.toFixed(1)),
    delta: parseFloat(delta.toFixed(1)),
    count: vals.length,
  };
}

// Significance badge component
function SigBadge({ p, className = "" }) {
  if (p === null) return <span className={`text-gray-400 text-xs ${className}`}>—</span>;
  const level = sigLevel(p);
  const sig = level !== "ns";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
      sig ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-gray-100 text-gray-500 border border-gray-200"
    } ${className}`}>
      {level !== "ns" && <span>⚡</span>}
      {level}
    </span>
  );
}

function PValueRow({ label, tResult }) {
  if (!tResult || tResult.p === null) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-mono">t({tResult.df}) = {tResult.t}</span>
        <SigBadge p={tResult.p} />
      </div>
    </div>
  );
}

// Custom tooltip for delta bar chart showing sig marker
function DeltaBarTooltip({ active, payload, label, tResults }) {
  if (!active || !payload?.length) return null;
  const tRes = tResults?.[label];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {p.value > 0 ? `+${p.value}` : p.value}
        </p>
      ))}
      {tRes && tRes.p !== null && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-gray-500">組間差異檢定（Δ）</p>
          <p className="font-mono text-gray-700">t({tRes.df}) = {tRes.t}</p>
          <p className={tRes.significant ? "text-orange-600 font-bold" : "text-gray-500"}>
            {tRes.label}
          </p>
        </div>
      )}
    </div>
  );
}

export default function GroupEfficiencyPanel({ participantData }) {
  const metrics = [
    { key: "Quiz",     label: "學習成就",   preF: "preQuiz",     postF: "postQuiz",     deltaF: "deltaQuiz",     max: 100, note: "" },
    { key: "Anxiety",  label: "焦慮量表",   preF: "preAnxiety",  postF: "postAnxiety",  deltaF: "deltaAnxiety",  max: 77,  note: "↓ 降低為正向" },
    { key: "Efficacy", label: "自我效能感", preF: "preEfficacy", postF: "postEfficacy", deltaF: "deltaEfficacy", max: 112, note: "" },
  ];

  const groupStats = {};
  GROUPS.forEach(g => {
    groupStats[g] = {};
    metrics.forEach(m => {
      groupStats[g][m.key] = getGroupStats(participantData, g, m.preF, m.postF, m.deltaF);
    });
  });

  // Run Welch's t-test for each metric × {pre, post, delta}
  const tResults = {};
  metrics.forEach(m => {
    const pairPre  = getGroupValues(participantData, "AI_Pair", m.preF);
    const soloPre  = getGroupValues(participantData, "AI_Solo", m.preF);
    const pairPost = getGroupValues(participantData, "AI_Pair", m.postF);
    const soloPost = getGroupValues(participantData, "AI_Solo", m.postF);
    const pairDelta = getGroupValues(participantData, "AI_Pair", m.deltaF);
    const soloDelta = getGroupValues(participantData, "AI_Solo", m.deltaF);
    tResults[m.key] = {
      pre:   welchTTest(pairPre,   soloPre),
      post:  welchTTest(pairPost,  soloPost),
      delta: welchTTest(pairDelta, soloDelta),
    };
  });

  // Delta chart data (for growth comparison bar)
  const deltaChartData = metrics.map(m => ({
    name: m.label,
    metricKey: m.key,
    AI_Pair: groupStats["AI_Pair"][m.key].delta,
    AI_Solo: groupStats["AI_Solo"][m.key].delta,
    sig: tResults[m.key].delta.significant,
  }));

  // tResults keyed by label for tooltip
  const deltaChartTResults = {};
  metrics.forEach(m => { deltaChartTResults[m.label] = tResults[m.key].delta; });

  // Trend data
  const trendData = (metricKey) => [
    {
      stage: "前測",
      AI_Pair: groupStats["AI_Pair"][metricKey].pre,
      AI_Solo: groupStats["AI_Solo"][metricKey].pre,
      sigLabel: tResults[metricKey].pre.significant ? tResults[metricKey].pre.label : null,
    },
    {
      stage: "後測",
      AI_Pair: groupStats["AI_Pair"][metricKey].post,
      AI_Solo: groupStats["AI_Solo"][metricKey].post,
      sigLabel: tResults[metricKey].post.significant ? tResults[metricKey].post.label : null,
    },
  ];

  // Radar: normalize
  const normalize = (val, max) => val !== null ? parseFloat(((val / max) * 100).toFixed(1)) : 0;
  const radarData = [
    {
      subject: "學習成就",
      AI_Pair: normalize(groupStats["AI_Pair"]["Quiz"].post, 100),
      AI_Solo: normalize(groupStats["AI_Solo"]["Quiz"].post, 100),
      sig: tResults["Quiz"].post.significant,
    },
    {
      subject: "焦慮（反向）",
      AI_Pair: groupStats["AI_Pair"]["Anxiety"].post !== null ? parseFloat((100 - normalize(groupStats["AI_Pair"]["Anxiety"].post, 77)).toFixed(1)) : 0,
      AI_Solo: groupStats["AI_Solo"]["Anxiety"].post !== null ? parseFloat((100 - normalize(groupStats["AI_Solo"]["Anxiety"].post, 77)).toFixed(1)) : 0,
      sig: tResults["Anxiety"].post.significant,
    },
    {
      subject: "自我效能感",
      AI_Pair: normalize(groupStats["AI_Pair"]["Efficacy"].post, 112),
      AI_Solo: normalize(groupStats["AI_Solo"]["Efficacy"].post, 112),
      sig: tResults["Efficacy"].post.significant,
    },
  ];

  const DeltaTag = ({ val, invert = false }) => {
    if (val === null) return <span className="text-gray-400 text-xs">—</span>;
    const isPositive = invert ? val < 0 : val > 0;
    const isNegative = invert ? val > 0 : val < 0;
    const cls = isPositive ? "text-green-700 bg-green-100" : isNegative ? "text-red-700 bg-red-100" : "text-gray-600 bg-gray-100";
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
        {val > 0 ? `+${val}` : val}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">組別效能比較</h2>
          <p className="text-xs text-gray-500 mt-0.5">AI_Pair vs AI_Solo — 學習成就、焦慮感、自我效能感之平均成長趨勢與統計顯著性分析（Welch's t-test，雙尾）</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: PAIR_COLOR }}></span>AI_Pair</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: SOLO_COLOR }}></span>AI_Solo</span>
          <span className="flex items-center gap-1.5 text-orange-600 font-semibold">⚡ p &lt; .05 顯著</span>
        </div>
      </div>

      {/* Statistical Significance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {metrics.map(m => (
          <div key={m.key} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-700 mb-2">{m.label} {m.note && <span className="text-gray-400 font-normal">{m.note}</span>}</p>
            <PValueRow label="前測組間差異" tResult={tResults[m.key].pre} />
            <PValueRow label="後測組間差異" tResult={tResults[m.key].post} />
            <PValueRow label="成長量組間差異" tResult={tResults[m.key].delta} />
            <div className="mt-2 pt-2 border-t border-gray-200 flex gap-2 text-xs text-gray-500">
              <span>AI_Pair: n={groupStats["AI_Pair"][m.key].count}</span>
              <span>AI_Solo: n={groupStats["AI_Solo"][m.key].count}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary stat table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-gray-500 font-medium text-xs">指標</th>
              {metrics.map(m => (
                <th key={m.key} colSpan={3} className="px-4 py-2.5 text-center text-gray-600 font-semibold text-xs border-l border-gray-100">
                  {m.label}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">項目</th>
              {metrics.map(m => (
                <>
                  <th key={`${m.key}-pair`} className="px-3 py-2 text-center font-medium border-l border-gray-100" style={{ color: PAIR_COLOR }}>AI_Pair</th>
                  <th key={`${m.key}-solo`} className="px-3 py-2 text-center font-medium" style={{ color: SOLO_COLOR }}>AI_Solo</th>
                  <th key={`${m.key}-sig`} className="px-3 py-2 text-center font-medium text-orange-500">顯著性</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "前測平均", statKey: "pre", tKey: "pre", isDelta: false },
              { label: "後測平均", statKey: "post", tKey: "post", isDelta: false },
              { label: "平均成長", statKey: "delta", tKey: "delta", isDelta: true },
              { label: "人數", statKey: "count", tKey: null, isDelta: false },
            ].map(row => (
              <tr key={row.label} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs font-medium text-gray-600">{row.label}</td>
                {metrics.map((m, mi) => {
                  const pairVal = groupStats["AI_Pair"][m.key][row.statKey];
                  const soloVal = groupStats["AI_Solo"][m.key][row.statKey];
                  const tRes = row.tKey ? tResults[m.key][row.tKey] : null;
                  const isAnxiety = m.key === "Anxiety";
                  return (
                    <>
                      <td key={`pair-${mi}`} className="px-3 py-2.5 text-center border-l border-gray-100 text-xs">
                        {row.isDelta ? <DeltaTag val={pairVal} invert={isAnxiety} /> : <span className="font-semibold text-gray-800">{pairVal ?? "—"}</span>}
                      </td>
                      <td key={`solo-${mi}`} className="px-3 py-2.5 text-center text-xs">
                        {row.isDelta ? <DeltaTag val={soloVal} invert={isAnxiety} /> : <span className="font-semibold text-gray-800">{soloVal ?? "—"}</span>}
                      </td>
                      <td key={`sig-${mi}`} className="px-3 py-2.5 text-center text-xs">
                        {tRes ? <SigBadge p={tRes.p} /> : <span className="text-gray-400">—</span>}
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trend lines per metric */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {metrics.map(m => {
          const tRes = tResults[m.key];
          const data = trendData(m.key);
          return (
            <div key={m.key} className={`rounded-xl p-4 border ${tRes.post.significant ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">{m.label} 趨勢對比</p>
                {tRes.post.significant && (
                  <span className="text-xs text-orange-600 font-bold">⚡ 後測顯著</span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const stageIdx = data.findIndex(d => d.stage === label);
                      const tKey = stageIdx === 0 ? "pre" : "post";
                      const t = tResults[m.key][tKey];
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs">
                          <p className="font-semibold mb-1">{label}</p>
                          {payload.map(p => <p key={p.dataKey} style={{ color: p.color }}>{p.dataKey}: {p.value}</p>)}
                          {t && t.p !== null && (
                            <p className={`mt-1 font-bold ${t.significant ? "text-orange-600" : "text-gray-400"}`}>{t.label}</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="AI_Pair" stroke={PAIR_COLOR} strokeWidth={2.5}
                    activeDot={{ r: 7 }}
                    dot={(props) => {
                      const { cx, cy, index } = props;
                      const isSig = index === 0 ? tRes.pre.significant : tRes.post.significant;
                      if (!isSig) return <circle key={`pair-dot-${index}`} cx={cx} cy={cy} r={5} stroke={PAIR_COLOR} strokeWidth={2} fill="white" />;
                      return (
                        <g key={`pair-dot-${index}`}>
                          <circle cx={cx} cy={cy} r={8} fill="#f97316" opacity={0.2} />
                          <circle cx={cx} cy={cy} r={5} stroke="#f97316" strokeWidth={2.5} fill="white" />
                        </g>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="AI_Solo" stroke={SOLO_COLOR} strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, index } = props;
                      const isSig = index === 0 ? tRes.pre.significant : tRes.post.significant;
                      if (!isSig) return <circle key={props.key} cx={cx} cy={cy} r={5} stroke={SOLO_COLOR} strokeWidth={2} fill="white" />;
                      return (
                        <g key={props.key}>
                          <circle cx={cx} cy={cy} r={8} fill="#f97316" opacity={0.2} />
                          <circle cx={cx} cy={cy} r={5} stroke="#f97316" strokeWidth={2.5} fill="white" />
                        </g>
                      );
                    }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-500 mt-1 text-center">
                後測：{tRes.post.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Delta bar + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Growth delta bar chart */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">平均成長量對比（後測 − 前測）</p>
          <p className="text-xs text-gray-400 mb-3">⚡ 橘框 = 成長量組間差異顯著（p &lt; .05）　焦慮：負值為正向改變</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deltaChartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<DeltaBarTooltip tResults={deltaChartTResults} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="AI_Pair" radius={[3, 3, 0, 0]}>
                {deltaChartData.map((entry, i) => (
                  <Cell key={i} fill={PAIR_COLOR} stroke={entry.sig ? "#f97316" : "transparent"} strokeWidth={entry.sig ? 2.5 : 0} />
                ))}
              </Bar>
              <Bar dataKey="AI_Solo" radius={[3, 3, 0, 0]}>
                {deltaChartData.map((entry, i) => (
                  <Cell key={i} fill={SOLO_COLOR} stroke={entry.sig ? "#f97316" : "transparent"} strokeWidth={entry.sig ? 2.5 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">後測綜合能力雷達圖（標準化 0–100）</p>
          <p className="text-xs text-gray-400 mb-3">⚡ 軸標題橘色 = 後測組間差異顯著　焦慮感取反向（越高越好）</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis
                dataKey="subject"
                tick={({ x, y, payload, index }) => {
                  const isSig = radarData[index]?.sig;
                  return (
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                      fontSize={11} fill={isSig ? "#f97316" : "#6b7280"} fontWeight={isSig ? "700" : "400"}>
                      {payload.value}{isSig ? " ⚡" : ""}
                    </text>
                  );
                }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name="AI_Pair" dataKey="AI_Pair" stroke={PAIR_COLOR} fill={PAIR_COLOR} fillOpacity={0.2} />
              <Radar name="AI_Solo" dataKey="AI_Solo" stroke={SOLO_COLOR} fill={SOLO_COLOR} fillOpacity={0.2} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend note */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
        <strong>統計說明：</strong>採用 Welch's t-test（雙尾，不假設等變異數），適用於兩組樣本數不同的情況。
        顯著性水準：*** p&lt;.001　** p&lt;.01　* p&lt;.05　ns 未達顯著。
        ⚡ 橘色標記代表該項目組間差異達顯著水準（p&lt;.05）。
      </div>
    </div>
  );
}