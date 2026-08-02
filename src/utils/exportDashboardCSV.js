import { getChatStatsByParticipant } from "@/utils/chatStats";

// 焦慮量表題目（anxiety：11 題，Q1~Q11）
const ANXIETY_QUESTIONS = [
  "Q1 我對自己的程式設計能力感到擔憂",
  "Q2 當程式變得複雜時，我會感到困惑",
  "Q3 我不信任自己能寫出正確的程式",
  "Q4 在學習程式設計時，我會感到緊張",
  "Q5 當課程內容涉及程式設計時，我會感到不安",
  "Q6 程式設計需要學習的內容太多，讓我感到害怕",
  "Q7 當我無法理解錯誤訊息時，我會感到焦慮",
  "Q8 程式中出現許多錯誤時，我會感到不安",
  "Q9 我會擔心在程式中出現錯誤",
  "Q10 當程式無法正常執行時，我會感到焦慮",
  "Q11 不斷進行除錯會讓我感到壓力",
];

// 自我效能感量表題目（efficacy：16 題，Q1~Q16）
const EFFICACY_QUESTIONS = [
  "Q1 我有能力理解基本的程式語法",
  "Q2 我能撰寫簡單的程式來解決問題",
  "Q3 我可以閱讀並理解他人撰寫的程式碼",
  "Q4 我能正確使用基本的程式指令",
  "Q5 我能設計程式來解決較複雜的問題",
  "Q6 我可以將問題拆解成可程式化的步驟",
  "Q7 我能規劃完整的程式邏輯流程",
  "Q8 我能選擇適當的程式方法來解決問題",
  "Q9 我能找出程式中的錯誤",
  "Q10 我可以修正程式錯誤並讓程式正常運作",
  "Q11 當程式出現錯誤時，我知道如何處理",
  "Q12 我能分析錯誤訊息並找出問題原因",
  "Q13 我能學習新的程式概念",
  "Q14 我能將所學應用到不同問題情境",
  "Q15 我能獨立完成程式設計任務",
  "Q16 我對提升程式能力有信心",
];

function buildScaleDetailCSV({ participants, scaleResponses, part, questions, surveyType, filename }) {
  // Build participant map (only the passed-in participants — respects class/group filters)
  const pMap = new Map(participants.map(p => [p.id, p]));
  const participantIds = new Set(participants.map(p => p.id));
  const filtered = scaleResponses.filter(r => r.part === part && r.survey_type === surveyType && participantIds.has(r.participant));

  const headers = [
    "參與者ID", "班級", "姓名", "學號", "組別",
    "survey_type", "版本號", "是否原始", "是否最新",
    "總分", "提交時間",
    ...questions.map((_, i) => `Q${i + 1}`),
  ];

  const rows = filtered
    .sort((a, b) => {
      const pa = pMap.get(a.participant)?.participant_id || "";
      const pb = pMap.get(b.participant)?.participant_id || "";
      if (pa !== pb) return pa.localeCompare(pb);
      return (a.version_no || 1) - (b.version_no || 1);
    })
    .map(r => {
      const p = pMap.get(r.participant) || {};
      const qCells = questions.map((_, i) => {
        const key = String(i); // answers stored as { "0": score, "1": score, ... }
        return r.answers?.[key] ?? r.answers?.[String(i + 1)] ?? "";
      });
      return [
        p.participant_id || r.participant,
        p.class_id || "",
        p.name || "",
        p.student_id || "",
        p.group || "",
        r.survey_type || "",
        r.version_no || 1,
        r.is_original ? "Y" : "N",
        r.is_latest ? "Y" : "N",
        r.total_score ?? "",
        r.timestamp ? new Date(r.timestamp).toLocaleString('zh-TW') : "",
        ...qCells,
      ];
    });

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// 協作學習知覺量表題目（collaboration：8 題，Q1~Q8）
const COLLABORATION_QUESTIONS = [
  "Q1 我在學習過程中能與AI夥伴進行有效的討論",
  "Q2 我積極參與與AI夥伴的互動過程",
  "Q3 與AI夥伴的小組討論有助於我理解課程內容",
  "Q4 與AI合作有助於我建構新的知識",
  "Q5 透過與AI討論，我能更深入理解程式設計概念",
  "Q6 與AI夥伴合作能幫助我解決學習上的問題",
  "Q7 我能從AI夥伴獲得學習上的幫助",
  "Q8 在與AI夥伴合作過程中，我感受到良好的支持與回饋",
];

export function exportAnxietyDetailCSV({ participants, scaleResponses, surveyType = "pre" }) {
  buildScaleDetailCSV({
    participants,
    scaleResponses,
    part: "anxiety",
    questions: ANXIETY_QUESTIONS,
    surveyType,
    filename: `anxiety_detail_${surveyType}_${new Date().toISOString().split('T')[0]}.csv`,
  });
}

export function exportEfficacyDetailCSV({ participants, scaleResponses, surveyType = "pre" }) {
  buildScaleDetailCSV({
    participants,
    scaleResponses,
    part: "efficacy",
    questions: EFFICACY_QUESTIONS,
    surveyType,
    filename: `efficacy_detail_${surveyType}_${new Date().toISOString().split('T')[0]}.csv`,
  });
}

export function exportCollaborationDetailCSV({ participants, scaleResponses, surveyType = "post" }) {
  buildScaleDetailCSV({
    participants,
    scaleResponses,
    part: "collaboration",
    questions: COLLABORATION_QUESTIONS,
    surveyType,
    filename: `collaboration_detail_${surveyType}_${new Date().toISOString().split('T')[0]}.csv`,
  });
}

export function exportDashboardCSV({ participants, attempts, assignmentList, chatLogs, filterClasses, filterGroups, filterStatuses, getStatus, getPreProgress }) {
  const filteredData = participants
    .filter(p => filterClasses.length === 0 || filterClasses.includes(p.class_id))
    .filter(p => filterGroups.length === 0 || filterGroups.includes(p.group))
    .filter(p => filterStatuses.length === 0 || filterStatuses.includes(getStatus(p)))
    .sort((a, b) => (a.student_id || '').localeCompare(b.student_id || ''));

  const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };

  const weekAssignments = [1,2,3,4,5,6].map(w =>
    assignmentList.filter(a => a.week_number === w && a.prompt_text).sort((a,b) => a.task_number - b.task_number)
  );

  const headers = [
    "參與者ID","班級","姓名","學號","組別","狀態","註冊時間","登入時間","完成時間","AI對話時間",
    "前測P1","前測P2","前測P3",
    ...weekAssignments.flatMap((wArr, i) => [...wArr.map(a => `W${i+1}_T${a.task_number}`), `W${i+1} 總分`])
  ];

  const rows = filteredData.map(p => {
    const pa = attempts.filter(a => a.participant === p.id).sort((a,b) => new Date(b.start_ts) - new Date(a.start_ts));
    const latest = pa[0];
    const status = getStatus(p);
    const preProgress = getPreProgress(p.id);
    const stats = getChatStatsByParticipant(chatLogs, p.id);

    const weekCols = weekAssignments.flatMap(wArr => {
      const taskCols = wArr.map(a => {
        const relevantAtts = attempts.filter(x => x.participant === p.id && x.assignment === a.id && (x.end_ts || x.teacher_rating));
        const ratedAtt = relevantAtts.filter(x => x.teacher_rating).sort((x,y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
        if (ratedAtt) return ratedAtt.teacher_rating;
        return relevantAtts.length > 0 ? "✓" : "";
      });
      const taskCount = wArr.length;
      if (taskCount === 0) return [...taskCols, ""];
      const participantAttempts = attempts.filter(a => a.participant === p.id && wArr.map(wt => wt.id).includes(a.assignment));
      let rawScore = 0; let gradedCount = 0;
      wArr.forEach(task => {
        const att = participantAttempts.find(a => a.assignment === task.id);
        if (att?.teacher_rating) { rawScore += RATING_SCORE[att.teacher_rating] || 0; gradedCount++; }
      });
      const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
      return [...taskCols, gradedCount > 0 ? totalScore.toFixed(1) : ""];
    });

    return [
      p.participant_id, p.class_id || "", p.name || "", p.student_id || "", p.group || "", status,
      p.created_at ? new Date(p.created_at).toLocaleString('zh-TW') : "",
      latest?.start_ts ? new Date(latest.start_ts).toLocaleString('zh-TW') : "",
      latest?.end_ts ? new Date(latest.end_ts).toLocaleString('zh-TW') : "",
      stats.conversation_active_minutes > 0 ? `${stats.conversation_active_minutes} 分鐘` : "—",
      preProgress.quiz ? "✓" : "", preProgress.anxiety ? "✓" : "", preProgress.efficacy ? "✓" : "",
      ...weekCols
    ];
  });

  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `teacher_dashboard_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}