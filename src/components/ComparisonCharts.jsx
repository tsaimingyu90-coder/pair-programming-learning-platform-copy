import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getChatStatsByParticipant } from "@/utils/chatStats";

const CLASS_CONFIG = [
  { class_id: "電子一甲", color: "#fcd34d" },
  { class_id: "電子二甲", color: "#fca5a5" },
  { class_id: "電子二乙", color: "#86efac" },
];

const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };

export default function ComparisonCharts({ attempts, assignments, participant, allParticipants, allAttempts, chatLogs = [], allClassChatLogs = [] }) {
  const getAssignmentById = (assignmentField) => {
    if (!assignmentField) return null;
    return assignments.find(a => a.id === assignmentField) ||
           assignments.find(a => a.assignment_id === assignmentField);
  };

  const chartData = useMemo(() => {
    // 個人已完成任務，依 week/task 排序
    const completedAttempts = attempts
      .filter(a => {
        if (!a.start_ts || !a.end_ts) return false;
        if (!a.assignment && !a.assignment_id) return false;
        return getAssignmentById(a.assignment || a.assignment_id) !== null;
      })
      .sort((a, b) => {
        const asgnA = getAssignmentById(a.assignment || a.assignment_id);
        const asgnB = getAssignmentById(b.assignment || b.assignment_id);
        if (!asgnA || !asgnB) return 0;
        if (asgnA.week_number !== asgnB.week_number) return asgnA.week_number - asgnB.week_number;
        return asgnA.task_number - asgnB.task_number;
      });

    // 個人指標
    const taskMetrics = completedAttempts.map((att, idx) => {
      const asgn = getAssignmentById(att.assignment || att.assignment_id);
      const duration = Math.round((new Date(att.end_ts) - new Date(att.start_ts)) / 60000);
      const aiStats = chatLogs.length > 0
        ? getChatStatsByParticipant(chatLogs, participant.id, att.id)
        : { conversation_rounds: 0 };
      const aiRounds = aiStats.conversation_rounds || 0;
      const score = att.teacher_rating ? RATING_SCORE[att.teacher_rating] : null;

      return {
        task: asgn?.assignment_id || `T${idx + 1}`,
        duration,
        aiRounds,
        score,
      };
    });

    // 各班平均
    if (allParticipants && allAttempts) {
      // 為每個班建立 participantId Set
      const classMaps = CLASS_CONFIG.map(cls => ({
        ...cls,
        ids: new Set(
          allParticipants
            .filter(p => p.class_id === cls.class_id && p.id !== participant.id)
            .map(p => p.id)
        ),
      }));

      taskMetrics.forEach((metric) => {
        classMaps.forEach(cls => {
          const clsAttempts = allAttempts.filter(a => {
            if (!a.end_ts || (!a.assignment && !a.assignment_id)) return false;
            if (!cls.ids.has(a.participant)) return false;
            const asgn = getAssignmentById(a.assignment || a.assignment_id);
            return asgn?.assignment_id === metric.task;
          });

          if (clsAttempts.length === 0) return;

          const key = cls.class_id;

          // 平均時間
          metric[`dur_${key}`] = Math.round(
            clsAttempts.reduce((sum, a) => sum + (new Date(a.end_ts) - new Date(a.start_ts)), 0) /
            clsAttempts.length / 60000
          );

          // 平均 AI 輪數（ChatLog）
          const rounds = clsAttempts.map(a => {
            const stats = getChatStatsByParticipant(allClassChatLogs, a.participant, a.id);
            return stats.conversation_rounds || 0;
          });
          metric[`ai_${key}`] = Math.round(rounds.reduce((s, r) => s + r, 0) / rounds.length);

          // 平均成績
          const ratings = clsAttempts
            .map(a => a.teacher_rating ? RATING_SCORE[a.teacher_rating] : null)
            .filter(r => r !== null);
          metric[`score_${key}`] = ratings.length > 0
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : undefined;
        });
      });
    }

    return taskMetrics;
  }, [attempts, assignments, participant, allParticipants, allAttempts, chatLogs, allClassChatLogs]);

  if (!participant || chartData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-6">
      <h2 className="text-lg font-bold text-gray-900">📊 與班級平均對比</h2>

      {/* Duration */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">每次完成任務使用的時間（分鐘）</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="task" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} labelStyle={{ color: "#fff" }} />
            <Legend />
            <Line type="monotone" dataKey="duration" stroke="#3b82f6" name="個人" strokeWidth={2} dot={{ r: 4 }} />
            {CLASS_CONFIG.map(cls => (
              chartData.some(d => d[`dur_${cls.class_id}`] !== undefined) && (
                <Line key={cls.class_id} type="monotone" dataKey={`dur_${cls.class_id}`} stroke={cls.color} name={`${cls.class_id}平均`} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* AI Rounds */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">AI 對話輪數（均基於 ChatLog）</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="task" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} labelStyle={{ color: "#fff" }} />
            <Legend />
            <Line type="monotone" dataKey="aiRounds" stroke="#a855f7" name="個人" strokeWidth={2} dot={{ r: 4 }} />
            {CLASS_CONFIG.map(cls => (
              chartData.some(d => d[`ai_${cls.class_id}`] !== undefined) && (
                <Line key={cls.class_id} type="monotone" dataKey={`ai_${cls.class_id}`} stroke={cls.color} name={`${cls.class_id}平均`} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Score */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">任務成績（滿分10）</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="task" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" domain={[0, 10]} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} formatter={(v) => v?.toFixed ? v.toFixed(1) : v} labelStyle={{ color: "#fff" }} />
            <Legend />
            <Line type="monotone" dataKey="score" stroke="#10b981" name="個人" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            {CLASS_CONFIG.map(cls => (
              chartData.some(d => d[`score_${cls.class_id}`] !== undefined) && (
                <Line key={cls.class_id} type="monotone" dataKey={`score_${cls.class_id}`} stroke={cls.color} name={`${cls.class_id}平均`} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}