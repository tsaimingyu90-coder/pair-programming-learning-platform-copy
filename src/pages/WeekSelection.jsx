import { useState, useEffect } from "react";
import { perfStart, logPerf, withTimeout } from "@/hooks/usePerf";
import { useNetworkMode } from "@/hooks/useNetworkMode";
import DegradedBanner from "@/components/DegradedBanner";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import NotificationCenter from "@/components/NotificationCenter";

export default function WeekSelection() {
  const [participant, setParticipant] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quizDone, setQuizDone] = useState(false);
  const [anxietyDone, setAnxietyDone] = useState(false);
  const [efficacyDone, setEfficacyDone] = useState(false);
  const [postQuizDone, setPostQuizDone] = useState(false);
  const [postAnxietyDone, setPostAnxietyDone] = useState(false);
  const [postEfficacyDone, setPostEfficacyDone] = useState(false);
  const [postCollabDone, setPostCollabDone] = useState(false);
  const [posttestUnlockLogs, setPosttestUnlockLogs] = useState([]); // active unlock logs for posttest
  const [availabilities, setAvailabilities] = useState([]);
  const [pretestUnlocks, setPretestUnlocks] = useState([]); // active unlock logs
  const { isDegradedMode, recordFailure, recordSuccess, setDegraded } = useNetworkMode();

  useEffect(() => {
    console.log("[WeekSelection] mounted");
    const p = sessionStorage.getItem("participant");
    const p2 = p ? JSON.parse(p) : null;
    if (p2) setParticipant(p2);

    const loadData = async () => {
      const _pageT0 = perfStart();
      // Phase 1: Load assignments only — unlock first render
      console.log("[WeekSelection] assignment start");
      const t0 = Date.now();
      let assignmentData;
      try {
        assignmentData = await withTimeout(base44.entities.Assignment.list());
        logPerf({ event: "week_assignment_load", page: "WeekSelection", duration: Date.now() - t0, status: "success", participant_id: p2?.participant_id, meta: { count: assignmentData.length } });
      } catch (err) {
        const isTimeout = err?.message === "__perf_timeout__";
        logPerf({ event: "week_assignment_load", page: "WeekSelection", duration: Date.now() - t0, status: isTimeout ? "timeout" : "error", participant_id: p2?.participant_id });
        assignmentData = [];
      }
      console.log(`[WeekSelection] assignment end — ${Date.now() - t0}ms, count: ${assignmentData.length}`);
      setAssignments(assignmentData);
      setLoading(false);
      logPerf({ event: "week_first_render", page: "WeekSelection", duration: Date.now() - _pageT0, status: "success", participant_id: p2?.participant_id });
      console.log("[WeekSelection] first render ready");

      if (!p2) return;

      // Phase 2: Load attempts in background
      console.log("[WeekSelection] attempt start");
      const t1 = Date.now();
      let attemptData = [];
      try {
        attemptData = await withTimeout(base44.entities.Attempt.filter({ participant: p2.id }, '-updated_date', 200));
        logPerf({ event: "week_attempt_load", page: "WeekSelection", duration: Date.now() - t1, status: "success", participant_id: p2.participant_id, meta: { count: attemptData.length } });
        recordSuccess();
      } catch (err) {
        const isTimeout = err?.message === "__perf_timeout__";
        logPerf({ event: "week_attempt_load", page: "WeekSelection", duration: Date.now() - t1, status: isTimeout ? "timeout" : "error", participant_id: p2.participant_id });
        recordFailure();
      }
      console.log(`[WeekSelection] attempt end — ${Date.now() - t1}ms, count: ${attemptData.length}`);
      setAttempts(attemptData);

      // Phase 2b: Load class-level availability in background
      if (p2?.class_id) {
        base44.entities.AssignmentAvailability.filter({ class_id: p2.class_id })
          .then(avData => setAvailabilities(avData))
          .catch(() => {});
      }

      // Phase 3: Load quiz + scale results in background
      console.log("[WeekSelection] quiz start");
      const t2 = Date.now();
      try {
        const [quizResults, scaleResults, postQuizResults, postScaleResults, unlockLogs, postUnlockLogs] = await withTimeout(Promise.all([
        base44.entities.QuizResult.filter({ participant: p2.id, survey_type: "pre" }),
        base44.entities.ScaleResponse.filter({ participant: p2.id, survey_type: "pre" }),
        base44.entities.QuizResult.filter({ participant: p2.id, survey_type: "post" }),
        base44.entities.ScaleResponse.filter({ participant: p2.id, survey_type: "post" }),
        base44.entities.PretestUnlockLog.filter({ participant_db_id: p2.id, is_active: true }),
        base44.entities.PosttestUnlockLog.filter({ participant_db_id: p2.id, is_active: true }),
        ]));
        logPerf({ event: "week_quiz_load", page: "WeekSelection", duration: Date.now() - t2, status: "success", participant_id: p2.participant_id });
        console.log(`[WeekSelection] quiz end — ${Date.now() - t2}ms`);
        setQuizDone(quizResults.length > 0);
        setAnxietyDone(scaleResults.some(r => r.part === "anxiety"));
        setEfficacyDone(scaleResults.some(r => r.part === "efficacy"));
        setPostQuizDone(postQuizResults.length > 0);
        setPostAnxietyDone(postScaleResults.some(r => r.part === "anxiety"));
        setPostEfficacyDone(postScaleResults.some(r => r.part === "efficacy"));
        setPostCollabDone(postScaleResults.some(r => r.part === "collaboration"));
        setPretestUnlocks(unlockLogs || []);
        setPosttestUnlockLogs(postUnlockLogs || []);
      } catch (err) {
        const isTimeout = err?.message === "__perf_timeout__";
        logPerf({ event: "week_quiz_load", page: "WeekSelection", duration: Date.now() - t2, status: isTimeout ? "timeout" : "error", participant_id: p2.participant_id });
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.08)", borderTopColor: "#007aff" }}></div>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
        <div className="text-center p-8 rounded-3xl" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
          <p className="mb-3" style={{ color: "#6e6e73" }}>請先進行 Check-in</p>
          <a href={createPageUrl("CheckIn")} style={{ color: "#007aff" }} className="text-sm hover:underline">前往 Check-in</a>
        </div>
      </div>
    );
  }

  // Group assignments by week (only show tasks with prompt_text and valid week_number)
  const weekGroups = {};
  assignments.filter(a => a.week_number).forEach(a => {
    if (!weekGroups[a.week_number]) weekGroups[a.week_number] = [];
    weekGroups[a.week_number].push(a);
  });

  // Sort tasks within each week
  Object.keys(weekGroups).forEach(week => {
    weekGroups[week].sort((a, b) => a.task_number - b.task_number);
  });

  const weeks = Object.keys(weekGroups).sort((a, b) => Number(a) - Number(b));

  const getAttemptAssignmentId = (a) => a?.assignment?.id || a?.assignment || a?.assignment_id;

  const getAttemptByAssignment = (assignmentId) => {
    return attempts.find(a => getAttemptAssignmentId(a) === assignmentId);
  };

  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.9) inset",
    borderRadius: 20,
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}>
      {isDegradedMode && <DegradedBanner />}
      <div className="p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="p-5 mb-6" style={glassCard}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>任務選單</h1>
              <p className="text-sm mt-1" style={{ color: "#6e6e73" }}>
                參與者：<span className="font-medium" style={{ color: "#3a3a3c" }}>{participant.participant_id}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href={createPageUrl("CheckIn")} className="text-xs hover:underline" style={{ color: "#aeaeb2" }}>← Check-in</a>
              <NotificationCenter participant={participant} />
            </div>
          </div>
        </div>

        {/* Pre-test survey status */}
        {(() => {
          const allDone = quizDone && anxietyDone && efficacyDone;
          const surveys = [
            {
              label: "第一部分：學習成就測驗",
              done: quizDone,
              href: `/QuizPage?type=pre&id=${participant.participant_id}`,
              unlocked: pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P1"),
            },
            {
              label: "第二部分：程式設計焦慮量表",
              done: anxietyDone,
              href: `/ScalePage?type=pre&part=2&id=${participant.participant_id}`,
              unlocked: pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P2"),
            },
            {
              label: "第三部分：自我效能感量表",
              done: efficacyDone,
              href: `/ScalePage?type=pre&part=3&id=${participant.participant_id}`,
              unlocked: pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P3"),
            },
          ];
          return (
            <div className="p-5 mb-6" style={{ ...glassCard, background: allDone ? "rgba(52,199,89,0.08)" : "rgba(255,149,0,0.08)", border: allDone ? "1px solid rgba(52,199,89,0.3)" : "1px solid rgba(255,149,0,0.35)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{allDone ? "✓" : "⚠️"}</span>
                <p className="text-sm font-semibold" style={{ color: allDone ? "#1a7f37" : "#b45309" }}>
                  {allDone ? "前測已全部完成，可以開始進行任務。" : "請先完成所有前測問卷，才能開始任務。"}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {surveys.map((s, i) => (
                  s.done && !s.unlocked ? (
                    <div key={i} className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.3)", color: "#1a7f37" }}>
                      <span>{s.label}</span>
                      <span className="ml-2 text-xs font-semibold">✓ 已完成</span>
                    </div>
                  ) : (
                    <a key={i} href={s.href} className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition" style={s.unlocked ? { background: "rgba(255,149,0,0.10)", border: "1px solid rgba(255,149,0,0.4)", color: "#b45309" } : { background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,149,0,0.4)", color: "#92400e" }}>
                      <span>{s.label}</span>
                      <span className="ml-2 text-xs font-semibold whitespace-nowrap">{s.unlocked ? "↻ 重做 →" : "前往 →"}</span>
                    </a>
                  )
                ))}
              </div>
            </div>
          );
        })()}

        {/* Post-test survey section */}
        {(() => {
          const isPartUnlocked = (partKey) =>
            posttestUnlockLogs.some(l =>
              l.is_active && (l.posttest_part === partKey || l.posttest_part === "all" || !l.posttest_part)
            );

          const postAllDone = postAnxietyDone && postEfficacyDone && postCollabDone;
          const postSurveys = [
            {
              label: "第一部分：學習成就測驗",
              done: postQuizDone,
              unlocked: isPartUnlocked("P1"),
              href: `/QuizPage?type=post&id=${participant.participant_id}`,
            },
            {
              label: "第二部分：程式設計焦慮量表",
              done: postAnxietyDone,
              unlocked: isPartUnlocked("P2"),
              href: `/ScalePage?type=post&part=2&id=${participant.participant_id}`,
            },
            {
              label: "第三部分：自我效能感量表",
              done: postEfficacyDone,
              unlocked: isPartUnlocked("P3"),
              href: `/ScalePage?type=post&part=3&id=${participant.participant_id}`,
            },
            {
              label: "第四部分：協作學習知覺量表",
              done: postCollabDone,
              unlocked: isPartUnlocked("P4"),
              href: `/ScalePage?type=post&part=4&id=${participant.participant_id}`,
            },
          ];

          const anyUnlocked = postSurveys.some(s => s.unlocked);

          // Locked state: no parts unlocked and not all done
          if (!anyUnlocked && !postAllDone) {
            return (
              <div className="p-5 mb-6 opacity-60" style={{ ...glassCard, background: "rgba(142,142,147,0.08)", border: "1px solid rgba(142,142,147,0.25)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔒</span>
                  <p className="text-sm font-semibold" style={{ color: "#6e6e73" }}>後測問卷（尚未開放）</p>
                </div>
                <p className="text-xs" style={{ color: "#aeaeb2" }}>後測尚未開放，請等待老師通知後再進行作答。</p>
              </div>
            );
          }

          return (
            <div className="p-5 mb-6" style={{ ...glassCard, background: postAllDone ? "rgba(52,199,89,0.08)" : "rgba(0,122,255,0.06)", border: postAllDone ? "1px solid rgba(52,199,89,0.3)" : "1px solid rgba(0,122,255,0.25)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{postAllDone ? "✓" : "📝"}</span>
                <p className="text-sm font-semibold" style={{ color: postAllDone ? "#1a7f37" : "#0055cc" }}>
                  後測問卷{postAllDone ? "已全部完成" : "（已開放，請儘速填寫）"}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                {postSurveys.map((s, i) => (
                  s.done ? (
                    <div key={i} className="flex-1 min-w-0 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.3)", color: "#1a7f37" }}>
                      <span className="truncate">{s.label}</span>
                      <span className="ml-2 text-xs font-semibold flex-shrink-0">✓ 已完成</span>
                    </div>
                  ) : s.unlocked ? (
                    <a key={i} href={s.href} className="flex-1 min-w-0 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,122,255,0.35)", color: "#0055cc" }}>
                      <span className="truncate">{s.label}</span>
                      <span className="ml-2 text-xs font-semibold flex-shrink-0">前往 →</span>
                    </a>
                  ) : (
                    <div key={i} className="flex-1 min-w-0 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium opacity-50 cursor-not-allowed" style={{ background: "rgba(142,142,147,0.1)", border: "1px solid rgba(142,142,147,0.2)", color: "#8e8e93" }}>
                      <span className="truncate">{s.label}</span>
                      <span className="ml-2 text-xs font-semibold flex-shrink-0">🔒 未開放</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          );
        })()}

        {/* Progress Summary */}
         {weeks.length > 0 && (() => {
           const allTasks = Object.values(weekGroups).flat();
           // Only count tasks that are open (same logic as card rendering)
           const openTasks = allTasks.filter(t => {
             const classAv = availabilities.find(av =>
               (av?.assignment?.id || av?.assignment || av?.assignment_id) === t.id
             );
             return classAv !== undefined ? classAv.is_open : t.is_open === true;
           });
           const total = openTasks.length;
           const completedCount = openTasks.filter(t => attempts.some(a => getAttemptAssignmentId(a) === t.id && a.end_ts)).length;
           const inProgressCount = openTasks.filter(t =>
             attempts.some(a => getAttemptAssignmentId(a) === t.id && !a.end_ts) &&
             !attempts.some(a => getAttemptAssignmentId(a) === t.id && a.end_ts)
           ).length;
          const notStartedCount = total - completedCount - inProgressCount;
          const completedPct = total ? (completedCount / total) * 100 : 0;
          const inProgressPct = total ? (inProgressCount / total) * 100 : 0;
          const notStartedPct = total ? (notStartedCount / total) * 100 : 0;
          return (
            <div className="p-5 mb-6" style={glassCard}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold" style={{ color: "#1d1d1f" }}>整體進度</h2>
                <span className="text-sm font-semibold" style={{ color: "#6e6e73" }}>{completedCount} / {total} 已完成</span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden flex mb-4" style={{ background: "rgba(0,0,0,0.06)" }}>
                {completedPct > 0 && <div style={{ width: `${completedPct}%`, background: "#34c759" }} className="transition-all" />}
                {inProgressPct > 0 && <div style={{ width: `${inProgressPct}%`, background: "#007aff" }} className="transition-all" />}
                {notStartedPct > 0 && <div style={{ width: `${notStartedPct}%`, background: "rgba(0,0,0,0.08)" }} className="transition-all" />}
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#34c759" }} />
                  <span className="text-xs" style={{ color: "#6e6e73" }}>已完成 <span className="font-semibold" style={{ color: "#1d1d1f" }}>{completedCount}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#007aff" }} />
                  <span className="text-xs" style={{ color: "#6e6e73" }}>進行中 <span className="font-semibold" style={{ color: "#1d1d1f" }}>{inProgressCount}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(0,0,0,0.15)" }} />
                  <span className="text-xs" style={{ color: "#6e6e73" }}>未開始 <span className="font-semibold" style={{ color: "#1d1d1f" }}>{notStartedCount}</span></span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Week cards */}
        {weeks.length === 0 ? (
          <div className="p-8 text-center" style={glassCard}>
            <p style={{ color: "#6e6e73" }}>目前沒有可用的任務</p>
          </div>
        ) : (
          <div className="space-y-6">
            {weeks.map(weekNum => (
              <div key={weekNum} className="p-6" style={glassCard}>
                <h2 className="text-lg font-semibold mb-4" style={{ color: "#1d1d1f", letterSpacing: "-0.01em" }}>第 {weekNum} 週</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {weekGroups[weekNum].map(task => {
                    const taskAttempt = attempts.find(
                      a => getAttemptAssignmentId(a) === task.id && a.end_ts
                    );
                    const isCompleted = !!taskAttempt;
                    const isRated = isCompleted && !!taskAttempt?.teacher_rating;
                    const isRedoOverride = isRated && !!taskAttempt?.allow_redo_override;
                    const isInProgress = attempts.some(
                      a => getAttemptAssignmentId(a) === task.id && !a.end_ts
                    ) && !isCompleted;
                    const isDisabled = !(quizDone && anxietyDone && efficacyDone);
                    const taskUrl = `/TaskPage?week=${task.week_number}&task=${task.task_number}&pid=${participant.id}`;
                    const classAv = availabilities.find(av =>
                      (av?.assignment?.id || av?.assignment || av?.assignment_id) === task.id
                    );
                    const isNotOpen = classAv !== undefined ? !classAv.is_open : task.is_open !== true;

                    const taskCardBase = {
                      borderRadius: 14,
                      padding: "12px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      transition: "all 0.15s",
                    };

                    return isDisabled ? (
                      <div key={task.id} style={{ ...taskCardBase, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)", opacity: 0.4, cursor: "not-allowed" }}>
                        <div className="text-2xl font-bold mb-1" style={{ color: "#aeaeb2" }}>T{task.task_number}</div>
                        <div className="text-xs truncate" style={{ color: "#aeaeb2" }} title={task.title}>{task.title || `任務 ${task.task_number}`}</div>
                        <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full self-center" style={{ background: "rgba(0,0,0,0.06)", color: "#aeaeb2" }}>{task.allow_ai ? "AI ✓" : "AI ✗"}</div>
                      </div>
                    ) : isNotOpen ? (
                      <div key={task.id} style={{ ...taskCardBase, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)", opacity: 0.55, cursor: "not-allowed" }}>
                        <div className="flex justify-center mb-2 min-h-6">
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(142,142,147,0.2)", color: "#8e8e93" }}>🔒 未開放</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: "#aeaeb2" }}>T{task.task_number}</div>
                        <div className="text-xs truncate mt-1" style={{ color: "#aeaeb2" }} title={task.title}>{task.title || `任務 ${task.task_number}`}</div>
                        <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full self-center" style={{ background: "rgba(0,0,0,0.06)", color: "#aeaeb2" }}>{task.allow_ai ? "AI ✓" : "AI ✗"}</div>
                      </div>
                    ) : (
                      <a
                        key={task.id}
                        href={taskUrl}
                        style={{
                          ...taskCardBase,
                          background: isCompleted ? "rgba(52,199,89,0.10)" : isInProgress ? "rgba(0,122,255,0.08)" : "rgba(255,255,255,0.55)",
                          border: isCompleted ? "1px solid rgba(52,199,89,0.35)" : isInProgress ? "1px solid rgba(0,122,255,0.3)" : "1px solid rgba(0,0,0,0.08)",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                          textDecoration: "none",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; }}
                      >
                        <div className="flex flex-row gap-1 flex-wrap justify-center items-center mb-2 min-h-6">
                          {isRedoOverride && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "#7c3aed", color: "#fff" }}>↻ 已開放重做</span>}
                          {isRated && !isRedoOverride && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "#f97316", color: "#fff" }}>🔒 已評分</span>}
                          {isCompleted && !isRated && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "#34c759", color: "#fff" }}>✓ 已完成</span>}
                          {isInProgress && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "#007aff", color: "#fff" }}>◐ 進行中</span>}
                          {!isCompleted && !isInProgress && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "rgba(142,142,147,0.25)", color: "#6e6e73" }}>○ 未開始</span>}
                        </div>
                        <div className="text-2xl font-bold" style={{ color: isCompleted ? "#1a7f37" : isInProgress ? "#0055cc" : "#3a3a3c" }}>T{task.task_number}</div>
                        <div className="text-xs truncate mt-1" style={{ color: "#8e8e93" }} title={task.title}>{task.title || `任務 ${task.task_number}`}</div>
                        <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full self-center" style={task.allow_ai ? { background: "rgba(52,199,89,0.12)", color: "#1a7f37" } : { background: "rgba(255,59,48,0.10)", color: "#cc3228" }}>
                          {task.allow_ai ? "AI ✓" : "AI ✗"}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}