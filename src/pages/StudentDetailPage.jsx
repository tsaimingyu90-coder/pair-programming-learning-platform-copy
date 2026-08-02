import { useState, useEffect, useRef, useCallback } from "react";
import StudentNotesPanel from "@/components/StudentNotesPanel";
import PretestDetailModal from "@/components/PretestDetailModal";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import FeedbackPromptSettings from "@/components/FeedbackPromptSettings";
import { loadAllClassDates, getClassWeekDate, getClassWeekPeriods, PERIODS } from "@/components/ClassWeekDatesModal";
import { base44 } from "@/api/base44Client";
import FeedbackTemplateManager from "@/components/FeedbackTemplateManager";
import AllTasksAIMetrics from "@/components/AllTasksAIMetrics";
import AllTasksTimeline from "@/components/AllTasksTimeline";
import ComparisonCharts from "@/components/ComparisonCharts";
import { getChatStatsByParticipant } from "@/utils/chatStats";
import { createPageUrl } from "@/utils";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from "recharts";
import { getScoreSelections, setScoreSelection } from "@/utils/scoreSelections.js";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle } from "docx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function StudentDetailPage() {
  const [participant, setParticipant] = useState(null);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResponses, setScaleResponses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exampleNotes, setExampleNotes] = useState([]);
  const [pretestUnlocks, setPretestUnlocks] = useState([]);
  const [questionBank, setQuestionBank] = useState([]);
  const [pretestModal, setPretestModal] = useState(null); // "quiz" | "anxiety" | "efficacy"
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [ratingInput, setRatingInput] = useState("");
  const [collapsedTimeline, setCollapsedTimeline] = useState(true);
  const [collapsedComparison, setCollapsedComparison] = useState(true);
  const [modalOpen, setModalOpen] = useState(null); // 'timeline' | 'comparison' | 'ai'
  const [availabilities, setAvailabilities] = useState([]);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackTemplates, setFeedbackTemplates] = useState([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [exportLoading, setExportLoading] = useState(null);
  const [exportFormat, setExportFormat] = useState(null);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [selectedPromptContent, setSelectedPromptContent] = useState(null);
  const [aiRainbowState, setAiRainbowState] = useState('off');
  const aiRainbowFadeRef = useRef(null);
  const [aiRatingState, setAiRatingState] = useState('off');
  const aiRatingFadeRef = useRef(null);
  const [generatingRating, setGeneratingRating] = useState(false);
  const [scoreSelections, setScoreSelections] = useState({});
  const [scoreModal, setScoreModal] = useState(null); // "preQuiz"|"preAnxiety"|"preEfficacy"|"postCollab"
  const [gradingMode, setGradingMode] = useState(false);
  const [gradingRecords, setGradingRecords] = useState([]);
  const [savingGrading, setSavingGrading] = useState(false);
  const [pendingCanvasUrl, setPendingCanvasUrl] = useState(null);
  const [codeAnnotation, setCodeAnnotation] = useState("");
  const [noteAnnotation, setNoteAnnotation] = useState("");
  const [brushSize, setBrushSize] = useState(4);
  const [drawTool, setDrawTool] = useState("pen"); // "pen" | "rect" | "text" | "eraser"
  const [canvasHasContent, setCanvasHasContent] = useState(false);
  const annotationCanvasRef = useRef(null); // ref to AnnotationCanvas component
  const imageRef = useRef(null);
  const allParticipantsRef = useRef([]);
  const allAttemptsRef = useRef([]);
  const allClassChatLogsRef = useRef(null); // null = not loaded yet
  const [loadingClassChatlogs, setLoadingClassChatlogs] = useState(false);

  const clearCanvas = useCallback(() => {
    annotationCanvasRef.current?.clear();
    setCanvasHasContent(false);
  }, []);

  // When grading mode becomes active, load pending canvas annotation
  useEffect(() => {
    if (!gradingMode || !pendingCanvasUrl) return;
    setTimeout(() => {
      annotationCanvasRef.current?.loadFromUrl(pendingCanvasUrl);
      setPendingCanvasUrl(null);
    }, 80);
  }, [gradingMode, pendingCanvasUrl]);

  const handleEndGrading = async () => {
    const hasCanvas = canvasHasContent;

    if (!codeAnnotation.trim() && !noteAnnotation.trim() && !hasCanvas) {
      setGradingMode(false);
      return;
    }

    setSavingGrading(true);
    const assignment = getAssignment(selectedAttempt.assignment);
    const pureCode = selectedAttempt.code_text?.split("\n").filter(l => !/^https?:\/\//.test(l.trim())).join("\n").trim();
    const existingForAttempt = gradingRecords.filter(r => r.attempt_id === selectedAttempt.id);
    const version = existingForAttempt.length + 1;

    let canvasImageUrl = null;
    if (hasCanvas && annotationCanvasRef.current) {
      const blob2 = await new Promise(resolve => annotationCanvasRef.current.toBlob(resolve, "image/png"));
      const file = new File([blob2], "grading_canvas.png", { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      canvasImageUrl = file_url;
    }

    const combinedAnnotation = codeAnnotation || "";

    const record = await base44.entities.GradingRecord.create({
      attempt_id: selectedAttempt.id,
      participant_id: participant.id,
      assignment_id: assignment?.assignment_id || "",
      version,
      original_code: pureCode || "",
      annotation: combinedAnnotation,
      note_annotation: noteAnnotation || "",
      canvas_image_url: canvasImageUrl,
      graded_at: new Date().toISOString(),
    });

    setGradingRecords(prev => [...prev, record]);
    annotationCanvasRef.current?.clear();
    setCanvasHasContent(false);
    setCodeAnnotation("");
    setNoteAnnotation("");
    setGradingMode(false);
    setSavingGrading(false);
    alert(`✅ 批改已保存（版本 v${version}）`);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const participantId = urlParams.get("id");
  const initialAttemptId = urlParams.get("attempt");

  const handleSaveFeedback = async () => {
    if (!selectedAttempt) return;
    setSavingFeedback(true);
    const updateData = {};
    if (feedbackInput.trim()) updateData.teacher_feedback = feedbackInput;
    if (ratingInput !== "") updateData.teacher_rating = ratingInput;
    await base44.entities.Attempt.update(selectedAttempt.id, updateData);
    // Re-fetch attempts to ensure W1 summary reflects latest ratings
    const allAttempts = await base44.entities.Attempt.list();
    const fresh = allAttempts
      .filter(a => a.participant === participant.id)
      .sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts));
    setAttempts(fresh);
    const updatedAttempt = fresh.find(a => a.id === selectedAttempt.id) || { ...selectedAttempt, ...updateData };
    setSelectedAttempt(updatedAttempt);
    setSavingFeedback(false);
    setFeedbackSaved(true);
    setTimeout(() => setFeedbackSaved(false), 2500);
  };

  const openAttemptModal = (attempt) => {
    if (!attempt) return;
    setSelectedAttempt(attempt);
    setFeedbackInput(attempt.teacher_feedback || "");
    setRatingInput(attempt.teacher_rating || "");
    setFeedbackSaved(false);
  };

  const getWeekAttempts = (weekNum) => {
    const weekAssignments = assignments.filter(a => a.week_number === weekNum && a.prompt_text);
    return attempts.filter(a => weekAssignments.map(wa => wa.id).includes(a.assignment));
  };

  const exportWeekProgress = async (weekNum, format) => {
    setExportLoading(weekNum);
    const weekAttempts = getWeekAttempts(weekNum);
    const headers = ["任務", "開始時間", "完成時間", "耗時(分鐘)", "提交方式", "AI使用(分鐘)", "教師評語"];
    
    const rows = weekAttempts.map(att => {
      const assign = getAssignment(att.assignment);
      const duration = att.end_ts ? Math.round((new Date(att.end_ts) - new Date(att.start_ts)) / 60000) : "—";
      return [
        assign?.assignment_id || "—",
        new Date(att.start_ts).toLocaleString('zh-TW'),
        att.end_ts ? new Date(att.end_ts).toLocaleString('zh-TW') : "—",
        duration,
        att.submit_type === "paste" ? "貼上" : att.submit_type === "upload" ? "上傳截圖" : "連結",
        att.ai_used ? (att.ai_minutes || "—") : "無",
        att.teacher_feedback || "—"
      ];
    });

    const filename = `${participant.participant_id}_W${weekNum}_學習歷程_${new Date().toISOString().split('T')[0]}`;

    if (format === "csv") {
      const csvHeaders = ["任務", "開始時間", "完成時間", "耗時(分鐘)", "提交方式", "AI使用(分鐘)", "評語與建議", "評分"];
      const csvRows = weekAttempts.map(att => {
        const assign = getAssignment(att.assignment);
        const duration = att.end_ts ? Math.round((new Date(att.end_ts) - new Date(att.start_ts)) / 60000) : "—";
        return [
          assign?.assignment_id || "—",
          new Date(att.start_ts).toLocaleString('zh-TW'),
          att.end_ts ? new Date(att.end_ts).toLocaleString('zh-TW') : "—",
          duration,
          att.submit_type === "paste" ? "貼上" : att.submit_type === "upload" ? "上傳截圖" : "連結",
          att.ai_used ? (att.ai_minutes || "—") : "無",
          att.teacher_feedback || "—",
          att.teacher_rating || "—"
        ];
      });
      const csv = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } else if (format === "docx") {
      const tableRows = [
        new TableRow({
          children: headers.map(h => new TableCell({ children: [new Paragraph(h)] })),
        }),
        ...rows.map(row => new TableRow({
          children: row.map(cell => new TableCell({ children: [new Paragraph(String(cell))] })),
        }))
      ];

      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ text: `${participant.participant_id} - 第 ${weekNum} 週學習歷程`, bold: true, size: 28 }),
            new Paragraph(""),
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          ],
        }],
      });

      Packer.toBlob(doc).then(blob => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.docx`;
        link.click();
      });
    } else if (format === "pdf") {
      // Create HTML table element
      const tableHtml = document.createElement('table');
      tableHtml.style.cssText = 'border-collapse: collapse; font-family: Arial; font-size: 12px;';
      
      const headerRow = tableHtml.insertRow();
      headerRow.style.backgroundColor = '#f0f0f0';
      headers.forEach(h => {
        const cell = headerRow.insertCell();
        cell.textContent = h;
        cell.style.cssText = 'border: 1px solid #999; padding: 8px; text-align: center;';
      });
      
      rows.forEach(row => {
        const tr = tableHtml.insertRow();
        row.forEach(cell => {
          const td = tr.insertCell();
          td.textContent = cell;
          td.style.cssText = 'border: 1px solid #ccc; padding: 6px; text-align: left;';
        });
      });
      
      document.body.appendChild(tableHtml);
      
      html2canvas(tableHtml, { scale: 2 }).then(canvas => {
        const doc = new jsPDF();
        const imgData = canvas.toDataURL('image/png');
        doc.text(`${participant.participant_id} - 第 ${weekNum} 週學習歷程`, 10, 10);
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, 'PNG', 10, 25, imgWidth, imgHeight);
        doc.save(`${filename}.pdf`);
        document.body.removeChild(tableHtml);
      });
    }

    setExportLoading(null);
    setExportFormat(null);
  };

  const playAiSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 650;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  };

  const loadTemplates = async () => {
    try {
      // Delay templates load to avoid racing with the main participant data load
      await new Promise(resolve => setTimeout(resolve, 2000));
      const data = await base44.entities.FeedbackTemplate.list("order");
      setFeedbackTemplates(data);
    } catch (err) {
      console.warn('Failed to load feedback templates:', err.message);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!participantId) return;
    const load = async () => {
      const participants = await base44.entities.Participant.filter({ participant_id: participantId });
      await new Promise(resolve => setTimeout(resolve, 200));
      const allAssignments = await base44.entities.Assignment.list();
      await new Promise(resolve => setTimeout(resolve, 200));
      const allParticipants = await base44.entities.Participant.list();
      await new Promise(resolve => setTimeout(resolve, 200));
      const qBank = await base44.entities.QuestionBank.list();
      setQuestionBank(qBank);
      allParticipantsRef.current = allParticipants;

      // 只抓該學生的 ChatLog，避免全量讀取造成 rate limit
      // 先等所有基礎資料載入完畢後再抓 ChatLog
      let allChatLogs = [];
      if (participants.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 800));
        let skip = 0;
        const pageSize = 200;
        while (true) {
          const batch = await base44.entities.ChatLog.filter(
            { participant: participants[0].id },
            "-timestamp",
            pageSize,
            skip
          );
          allChatLogs = [...allChatLogs, ...batch];
          if (batch.length < pageSize) break;
          skip += pageSize;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      setChatLogs(allChatLogs);

      if (participants.length > 0) {
        const p = participants[0];
        // 逐批串行，每批最多 2 個，避免 rate limit
        const notes = await base44.entities.ExampleNote.filter({ participant: p.id });
        await new Promise(resolve => setTimeout(resolve, 300));
        const records = await base44.entities.GradingRecord.filter({ participant_id: p.id });
        await new Promise(resolve => setTimeout(resolve, 300));
        const quizzes = await base44.entities.QuizResult.filter({ participant: p.id });
        await new Promise(resolve => setTimeout(resolve, 300));
        const scales = await base44.entities.ScaleResponse.filter({ participant: p.id });
        await new Promise(resolve => setTimeout(resolve, 300));
        const unlocks = await base44.entities.PretestUnlockLog.filter({ participant_db_id: p.id, is_active: true });
        await new Promise(resolve => setTimeout(resolve, 500));
        const attmpts = await base44.entities.Attempt.filter({ participant: p.id }, "-start_ts");
        await new Promise(resolve => setTimeout(resolve, 600));
        const allAttempts = await base44.entities.Attempt.list("-start_ts", 2000);
        setExampleNotes(notes);
        setGradingRecords(records);
        setPretestUnlocks(unlocks);
        allAttemptsRef.current = allAttempts;

        setParticipant(p);

        const sortedAttmpts = attmpts.sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts));

        // Load availability data
        if (p?.class_id) {
          base44.entities.AssignmentAvailability.filter({ class_id: p.class_id })
            .then(avData => setAvailabilities(avData))
            .catch(() => {});
        }

        setQuizResults(quizzes);
        setScaleResponses(scales);
        setAttempts(sortedAttmpts);
        setScoreSelections(getScoreSelections(p.id));

        // Auto-open attempt if specified in URL
        if (initialAttemptId) {
          const targetAttempt = sortedAttmpts.find(a => a.id === initialAttemptId);
          if (targetAttempt) {
            setSelectedAttempt(targetAttempt);
            setFeedbackInput(targetAttempt.teacher_feedback || "");
            setRatingInput(targetAttempt.teacher_rating || "");
          }
        }
      }
      
      setAssignments(allAssignments);
      setLoading(false);
    };
    load();
  }, [participantId]);

  const getAssignment = (id) => assignments.find(a => a.id === id);

  // Pre/post quiz & scale — pick is_latest=true as primary, else fallback to highest version_no
  const preQuizAll = quizResults.filter(q => q.survey_type === "pre").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const preQuiz = preQuizAll.find(q => q.is_latest) || preQuizAll[0];
  const postQuiz = quizResults.find(q => q.survey_type === "post");
  const preAnxietyAll = scaleResponses.filter(s => s.survey_type === "pre" && s.part === "anxiety").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const preAnxiety = preAnxietyAll.find(s => s.is_latest) || preAnxietyAll[0];
  const postAnxiety = scaleResponses.find(s => s.survey_type === "post" && s.part === "anxiety");
  const preEfficacyAll = scaleResponses.filter(s => s.survey_type === "pre" && s.part === "efficacy").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const preEfficacy = preEfficacyAll.find(s => s.is_latest) || preEfficacyAll[0];
  const postEfficacy = scaleResponses.find(s => s.survey_type === "post" && s.part === "efficacy");
  const postCollaboration = scaleResponses.find(s => s.survey_type === "post" && s.part === "collaboration");

  // Post-test latest versions
  const postQuizAll = quizResults.filter(q => q.survey_type === "post").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const postQuizLatest = postQuizAll.find(q => q.is_latest) || postQuizAll[0];
  const postAnxietyAll = scaleResponses.filter(s => s.survey_type === "post" && s.part === "anxiety").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const postAnxietyLatest = postAnxietyAll.find(s => s.is_latest) || postAnxietyAll[0];
  const postEfficacyAll = scaleResponses.filter(s => s.survey_type === "post" && s.part === "efficacy").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const postEfficacyLatest = postEfficacyAll.find(s => s.is_latest) || postEfficacyAll[0];
  const postCollaborationAll = scaleResponses.filter(s => s.survey_type === "post" && s.part === "collaboration").sort((a, b) => (b.version_no || 1) - (a.version_no || 1));
  const postCollaborationLatest = postCollaborationAll.find(s => s.is_latest) || postCollaborationAll[0];

  // Redo info: previous version = second-highest version_no
  const preQuizPrev = preQuizAll.length > 1 ? preQuizAll[1] : null;
  const preAnxietyPrev = preAnxietyAll.length > 1 ? preAnxietyAll[1] : null;
  const preEfficacyPrev = preEfficacyAll.length > 1 ? preEfficacyAll[1] : null;

  const fmtRedoDate = (ts) => ts ? new Date(ts).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }) : null;

  const toggleScoreSelection = (field) => {
    const current = scoreSelections[field] || "latest";
    const next = current === "latest" ? "original" : "latest";
    setScoreSelection(participant.id, field, next);
    setScoreSelections(prev => ({ ...prev, [field]: next }));
  };

  // Resolve displayed score based on user selection
  const resolveScore = (allVersions, field, scoreKey = "total_score") => {
    if (!allVersions || allVersions.length === 0) return null;
    const sorted = [...allVersions].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
    const original = sorted[0];
    const latest = sorted[sorted.length - 1];
    const choice = scoreSelections[field] || "latest";
    return choice === "original" ? original : latest;
  };

  // Trend display: pre→post
  const TrendSparkline = ({ preVal, postVal, maxVal, invertDirection = false }) => {
    if (preVal == null || postVal == null) return null;
    const diff = postVal - preVal;
    const isFlat = diff === 0;
    // For anxiety: lower is better, so down = green, up = red
    const isPositive = invertDirection ? diff < 0 : diff > 0;
    const isUp = diff > 0;
    const pct = Math.round((diff / maxVal) * 100);
    const preBar = Math.round((preVal / maxVal) * 100);
    const postBar = Math.round((postVal / maxVal) * 100);
    return (
      <div className="mt-3 pt-2 border-t border-gray-100">
        {/* Bar comparison */}
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">前</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${preBar}%` }} />
            </div>
            <span className="text-xs font-semibold text-blue-600 w-8 text-right flex-shrink-0">{preVal}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">後</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isFlat ? "bg-gray-400" : isPositive ? "bg-green-500" : "bg-red-400"}`} style={{ width: `${postBar}%` }} />
            </div>
            <span className={`text-xs font-semibold w-8 text-right flex-shrink-0 ${isFlat ? "text-gray-400" : isPositive ? "text-green-600" : "text-red-500"}`}>{postVal}</span>
          </div>
        </div>
        {/* Delta badge */}
        <div className="flex justify-end">
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
            isFlat ? "bg-gray-100 text-gray-400" : isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          }`}>
            {isFlat ? "― 持平" : isUp ? `▲ +${diff} (+${pct}%)` : `▼ ${diff} (${pct}%)`}
          </span>
        </div>
      </div>
    );
  };

  const radarData = [
    {
      name: "前測",
      "學習成就": preQuiz?.score || 0,
      "焦慮量表": Math.round((preAnxiety?.total_score || 0) / 77 * 100),
      "自我效能感": Math.round((preEfficacy?.total_score || 0) / 112 * 100),
    },
    {
      name: "後測",
      "學習成就": postQuiz?.score || 0,
      "焦慮量表": Math.round((postAnxiety?.total_score || 0) / 77 * 100),
      "自我效能感": Math.round((postEfficacy?.total_score || 0) / 112 * 100),
    },
  ];

  const weekGroups = {};
  assignments.forEach(a => {
    if (a.week_number && a.prompt_text) {
      if (!weekGroups[a.week_number]) weekGroups[a.week_number] = [];
      weekGroups[a.week_number].push(a);
    }
  });
  Object.keys(weekGroups).forEach(week => {
    weekGroups[week].sort((a, b) => a.task_number - b.task_number);
  });

  const getTaskStatus = (assignmentId) => {
    // Check if the task is open
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return "未開放";
    
    const classAv = availabilities.find(av => (av?.assignment?.id || av?.assignment) === assignmentId);
    const isNotOpen = classAv !== undefined ? !classAv.is_open : assignment.is_open !== true;
    if (isNotOpen) return "未開放";
    
    const att = attempts.find(a => a.assignment === assignmentId && a.end_ts && (a.code_text || a.link_url));
    return att ? "已完成" : "未完成";
  };

  const glassCard = { background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.6)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" };
  const glassBg = { background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)", minHeight: "100vh" };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={glassBg}>
      <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (!participant) return (
    <div className="min-h-screen flex items-center justify-center" style={glassBg}>
      <p style={{ color: "#8e8e93" }}>找不到參與者</p>
    </div>
  );

  const mainView = (
    <div className="p-6" style={glassBg}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <a href={createPageUrl("TeacherDashboard")} className="text-sm transition" style={{ color: "#aeaeb2" }}>
            ← 返回教師看板
          </a>
          <button
            onClick={() => {
              const sorted = allParticipantsRef.current.slice().sort((a, b) => (a.student_id || "").localeCompare(b.student_id || ""));
              const curIdx = sorted.findIndex(p => p.participant_id === participant.participant_id);
              if (curIdx > 0) {
                window.location.href = `/StudentDetailPage?id=${sorted[curIdx - 1].participant_id}`;
              } else {
                alert("已是第一位同學");
              }
            }}
            className="text-sm font-medium transition" style={{ color: "#6e6e73" }}
          >
            ← 上一位同學
          </button>
          <button
            onClick={() => {
              const sorted = allParticipantsRef.current.slice().sort((a, b) => (a.student_id || "").localeCompare(b.student_id || ""));
              const curIdx = sorted.findIndex(p => p.participant_id === participant.participant_id);
              if (curIdx >= 0 && curIdx < sorted.length - 1) {
                window.location.href = `/StudentDetailPage?id=${sorted[curIdx + 1].participant_id}`;
              } else {
                alert("已是最後一位同學");
              }
            }}
            className="text-sm font-medium transition" style={{ color: "#007aff" }}
          >
            下一位同學 →
          </button>
        </div>

        <div className="p-6 mb-6" style={glassCard}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-base" style={{ background: "rgba(99,102,241,0.12)", color: "#4338ca" }}>
              {participant.participant_id}
            </div>
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "#1d1d1f" }}>{participant.name || participant.participant_id}</h1>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={participant.group === "AI_Pair" ? { background: "rgba(99,102,241,0.10)", color: "#4338ca", border: "1px solid rgba(99,102,241,0.2)" } : { background: "rgba(245,158,11,0.10)", color: "#92400e", border: "1px solid rgba(245,158,11,0.2)" }}>
                  {participant.group}
                </span>
                {participant.class_id && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.08)" }}>
                    {participant.class_id}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setModalOpen('ai')} className="px-3 py-1.5 rounded-xl text-sm font-medium transition" style={{ background: "rgba(99,102,241,0.08)", color: "#4338ca", border: "1px solid rgba(99,102,241,0.18)" }}>
                📊 AI 對話指標
              </button>
              <button onClick={() => setModalOpen('timeline')} className="px-3 py-1.5 rounded-xl text-sm font-medium transition" style={{ background: "rgba(0,122,255,0.08)", color: "#007aff", border: "1px solid rgba(0,122,255,0.18)" }}>
                ⏱ 任務時間軸
              </button>
              <button
                onClick={async () => {
                  setModalOpen('comparison');
                  if (allClassChatLogsRef.current === null && participant) {
                    setLoadingClassChatlogs(true);
                    const classmateIds = allParticipantsRef.current
                      .filter(p => p.class_id === participant.class_id && p.id !== participant.id)
                      .map(p => p.id);
                    let logs = [];
                    for (const cmId of classmateIds) {
                      let skip = 0;
                      while (true) {
                        const batch = await base44.entities.ChatLog.filter({ participant: cmId }, "-timestamp", 500, skip);
                        logs.push(...batch);
                        if (batch.length < 500) break;
                        skip += 500;
                        await new Promise(resolve => setTimeout(resolve, 600));
                      }
                      await new Promise(resolve => setTimeout(resolve, 800));
                    }
                    allClassChatLogsRef.current = logs;
                    setLoadingClassChatlogs(false);
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition" style={{ background: "rgba(168,85,247,0.08)", color: "#7c3aed", border: "1px solid rgba(168,85,247,0.18)" }}
              >
                📈 與班級平均對比
              </button>
            </div>
          </div>
        </div>

        {/* 前測 / 後測 比較 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Quiz card */}
           {(() => {
             const done = !!preQuiz;
             const hasActiveUnlock = pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P1");
             const isUnlocked = hasActiveUnlock && done;
             const cardClass = done && !isUnlocked ? "bg-green-50 border-green-300" : isUnlocked ? "bg-orange-50 border-orange-400" : "bg-white border-amber-400";
             const hasRedo = preQuizAll.length > 1;
             const displayRecord = resolveScore(preQuizAll, "preQuiz", "score");
             const displayScore = displayRecord?.score ?? "—";
             const selChoice = scoreSelections["preQuiz"] || "latest";
            return (
              <div className={`rounded-xl border p-4 transition cursor-pointer hover:shadow-md`} style={{ background: cardClass.includes("green") ? "rgba(240,255,244,0.9)" : cardClass.includes("orange") ? "rgba(255,247,237,0.9)" : "white", borderColor: cardClass.includes("green") ? "#86efac" : cardClass.includes("orange") ? "#fb923c" : "#fbbf24" }} onClick={() => setScoreModal("preQuiz")}>
                <p className="text-xs font-semibold text-gray-500 mb-2">學習成就 {hasRedo && <span className="ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">重做 ✎</span>}</p>
                <div className="space-y-1">
                  <p className="text-sm"><span className="text-gray-500">前測：</span><span className="font-bold text-lg text-blue-600">{displayScore}</span>/100
                    {hasRedo && <span className="ml-1 text-xs text-gray-400">（{selChoice === "latest" ? "重做" : "原始"}）</span>}
                  </p>
                  <p className="text-sm"><span className="text-gray-500">後測：</span><span className="font-bold text-lg text-green-600">{postQuiz?.score ?? "—"}</span>/100</p>
                  <TrendSparkline preVal={displayScore !== "—" ? displayScore : null} postVal={postQuiz?.score} maxVal={100} />
                </div>
              </div>
            );
          })()}

          {/* Anxiety card */}
           {(() => {
             const done = !!preAnxiety;
             const hasActiveUnlock = pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P2");
             const isUnlocked = hasActiveUnlock && done;
             const cardClass = done && !isUnlocked ? "bg-green-50 border-green-300" : isUnlocked ? "bg-orange-50 border-orange-400" : "bg-white border-amber-400";
             const hasRedo = preAnxietyAll.length > 1;
             const displayRecord = resolveScore(preAnxietyAll, "preAnxiety", "total_score");
             const displayScore = displayRecord?.total_score ?? "—";
             const selChoice = scoreSelections["preAnxiety"] || "latest";
            return (
              <div className={`rounded-xl border p-4 transition cursor-pointer hover:shadow-md`} style={{ background: cardClass.includes("green") ? "rgba(240,255,244,0.9)" : cardClass.includes("orange") ? "rgba(255,247,237,0.9)" : "white", borderColor: cardClass.includes("green") ? "#86efac" : cardClass.includes("orange") ? "#fb923c" : "#fbbf24" }} onClick={() => setScoreModal("preAnxiety")}>
                <p className="text-xs font-semibold text-gray-500 mb-2">焦慮量表 {hasRedo && <span className="ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">重做 ✎</span>}</p>
                <div className="space-y-1">
                  <p className="text-sm"><span className="text-gray-500">前測：</span><span className="font-bold text-lg text-blue-600">{displayScore}</span>/77
                    {hasRedo && <span className="ml-1 text-xs text-gray-400">（{selChoice === "latest" ? "重做" : "原始"}）</span>}
                  </p>
                  <p className="text-sm"><span className="text-gray-500">後測：</span><span className="font-bold text-lg text-green-600">{postAnxiety?.total_score ?? "—"}</span>/77</p>
                  <TrendSparkline preVal={displayScore !== "—" ? displayScore : null} postVal={postAnxiety?.total_score} maxVal={77} invertDirection={true} />
                </div>
              </div>
            );
          })()}

          {/* Efficacy card */}
           {(() => {
             const done = !!preEfficacy;
             const hasActiveUnlock = pretestUnlocks.some(l => !l.pretest_part || l.pretest_part === "P3");
             const isUnlocked = hasActiveUnlock && done;
             const cardClass = done && !isUnlocked ? "bg-green-50 border-green-300" : isUnlocked ? "bg-orange-50 border-orange-400" : "bg-white border-amber-400";
             const hasRedo = preEfficacyAll.length > 1;
             const displayRecord = resolveScore(preEfficacyAll, "preEfficacy", "total_score");
             const displayScore = displayRecord?.total_score ?? "—";
             const selChoice = scoreSelections["preEfficacy"] || "latest";
            return (
              <div className={`rounded-xl border p-4 transition cursor-pointer hover:shadow-md`} style={{ background: cardClass.includes("green") ? "rgba(240,255,244,0.9)" : cardClass.includes("orange") ? "rgba(255,247,237,0.9)" : "white", borderColor: cardClass.includes("green") ? "#86efac" : cardClass.includes("orange") ? "#fb923c" : "#fbbf24" }} onClick={() => setScoreModal("preEfficacy")}>
                <p className="text-xs font-semibold text-gray-500 mb-2">自我效能感 {hasRedo && <span className="ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">重做 ✎</span>}</p>
                <div className="space-y-1">
                  <p className="text-sm"><span className="text-gray-500">前測：</span><span className="font-bold text-lg text-blue-600">{displayScore}</span>/112
                    {hasRedo && <span className="ml-1 text-xs text-gray-400">（{selChoice === "latest" ? "重做" : "原始"}）</span>}
                  </p>
                  <p className="text-sm"><span className="text-gray-500">後測：</span><span className="font-bold text-lg text-green-600">{postEfficacy?.total_score ?? "—"}</span>/112</p>
                  <TrendSparkline preVal={displayScore !== "—" ? displayScore : null} postVal={postEfficacy?.total_score} maxVal={112} />
                </div>
              </div>
            );
          })()}

          {/* Collaboration card (後測限定) */}
          {(() => {
            const done = !!postCollaborationLatest;
            const hasRedo = postCollaborationAll.length > 1;
            const displayRecord = resolveScore(postCollaborationAll, "postCollab", "total_score");
            const displayScore = displayRecord?.total_score ?? "—";
            const selChoice = scoreSelections["postCollab"] || "latest";
            return (
              <div className={`rounded-xl border p-4 transition cursor-pointer hover:shadow-md`} style={{ background: done ? "rgba(240,255,244,0.9)" : "white", borderColor: done ? "#86efac" : "#e5e7eb" }} onClick={() => setScoreModal("postCollab")}>
                <p className="text-xs font-semibold text-gray-500 mb-2">協作學習知覺 {hasRedo && <span className="ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">重做 ✎</span>}</p>
                <div className="space-y-1">
                  <p className="text-sm"><span className="text-gray-500">前測：</span><span className="font-bold text-lg text-blue-600">—</span></p>
                  <p className="text-sm"><span className="text-gray-500">後測：</span><span className="font-bold text-lg text-green-600">{displayScore}</span>/112
                    {hasRedo && <span className="ml-1 text-xs text-gray-400">（{selChoice === "latest" ? "重做" : "原始"}）</span>}
                  </p>
                </div>
                {displayRecord?.timestamp && (
                  <p className="text-xs text-gray-400 mt-1">{new Date(displayRecord.timestamp).toLocaleDateString("zh-TW")}</p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Score Selection Modal */}
        {scoreModal && (() => {
          const configs = {
            preQuiz: {
              label: "學習成就（前測）",
              allVersions: preQuizAll,
              field: "preQuiz",
              scoreKey: "score",
              maxVal: 100,
              pretestType: "quiz",
              hasDone: !!preQuiz,
            },
            preAnxiety: {
              label: "焦慮量表（前測）",
              allVersions: preAnxietyAll,
              field: "preAnxiety",
              scoreKey: "total_score",
              maxVal: 77,
              pretestType: "anxiety",
              hasDone: !!preAnxiety,
            },
            preEfficacy: {
              label: "自我效能感（前測）",
              allVersions: preEfficacyAll,
              field: "preEfficacy",
              scoreKey: "total_score",
              maxVal: 112,
              pretestType: "efficacy",
              hasDone: !!preEfficacy,
            },
            postCollab: {
              label: "協作學習知覺（後測）",
              allVersions: postCollaborationAll,
              field: "postCollab",
              scoreKey: "total_score",
              maxVal: 112,
              pretestType: "collaboration",
              hasDone: !!postCollaborationLatest,
            },
          };
          const cfg = configs[scoreModal];
          if (!cfg) return null;
          const hasRedo = cfg.allVersions.length > 1;
          const selChoice = scoreSelections[cfg.field] || "latest";
          const sorted = [...cfg.allVersions].sort((a, b) => (a.version_no || 1) - (b.version_no || 1));
          const originalRecord = sorted[0];
          const latestRecord = sorted[sorted.length - 1];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)" }} onClick={() => setScoreModal(null)}>
              <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.95)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-800">{cfg.label}</h3>
                  <button onClick={() => setScoreModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
                </div>

                {hasRedo ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 font-medium">此量表有重做紀錄，請選擇要使用哪個分數作為統計依據：</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setScoreSelection(participant.id, cfg.field, "original");
                          setScoreSelections(prev => ({ ...prev, [cfg.field]: "original" }));
                        }}
                        className={`p-3 rounded-xl border-2 text-center transition ${selChoice === "original" ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                      >
                        <p className="text-xs font-semibold text-gray-600 mb-1">原始分數</p>
                        <p className="text-2xl font-bold text-orange-600">{originalRecord?.[cfg.scoreKey] ?? "—"}</p>
                        <p className="text-xs text-gray-400">{originalRecord?.timestamp ? new Date(originalRecord.timestamp).toLocaleDateString("zh-TW") : "—"}</p>
                        {selChoice === "original" && <p className="text-xs text-orange-500 font-semibold mt-1">✓ 目前使用</p>}
                      </button>
                      <button
                        onClick={() => {
                          setScoreSelection(participant.id, cfg.field, "latest");
                          setScoreSelections(prev => ({ ...prev, [cfg.field]: "latest" }));
                        }}
                        className={`p-3 rounded-xl border-2 text-center transition ${selChoice === "latest" ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                      >
                        <p className="text-xs font-semibold text-gray-600 mb-1">重做分數</p>
                        <p className="text-2xl font-bold text-blue-600">{latestRecord?.[cfg.scoreKey] ?? "—"}</p>
                        <p className="text-xs text-gray-400">{latestRecord?.timestamp ? new Date(latestRecord.timestamp).toLocaleDateString("zh-TW") : "—"}</p>
                        {selChoice === "latest" && <p className="text-xs text-blue-500 font-semibold mt-1">✓ 目前使用</p>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">此量表無重做紀錄。</p>
                )}

                {cfg.hasDone && (
                  <button
                    onClick={() => { setScoreModal(null); setPretestModal(cfg.pretestType); }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition"
                    style={{ background: "rgba(0,122,255,0.08)", color: "#007aff", border: "1px solid rgba(0,122,255,0.2)" }}
                  >
                    📋 查看詳細作答紀錄
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* 浮動視窗 */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)" }} onClick={() => setModalOpen(null)}>
            <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto" style={{ ...glassCard, background: "rgba(255,255,255,0.92)" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", borderRadius: "18px 18px 0 0" }}>
                <h2 className="text-lg font-semibold" style={{ color: "#1d1d1f" }}>
                  {modalOpen === 'ai' && '📊 AI 對話指標'}
                  {modalOpen === 'timeline' && '⏱ 已完成任務的時間軸'}
                  {modalOpen === 'comparison' && '📈 與班級平均對比'}
                </h2>
                <button onClick={() => setModalOpen(null)} className="text-xl font-bold leading-none" style={{ color: "#8e8e93" }}>✕</button>
              </div>
              <div className="p-6">
                {modalOpen === 'ai' && (
                  <AllTasksAIMetrics participant={participant} attempts={attempts} chatLogs={chatLogs} />
                )}
                {modalOpen === 'timeline' && (
                  <AllTasksTimeline attempts={attempts} assignments={assignments} chatLogs={chatLogs} participant={participant} containerWidth={800} />
                )}
                {modalOpen === 'comparison' && (
                  loadingClassChatlogs ? (
                    <div className="flex items-center justify-center py-12 gap-3" style={{ color: "#8e8e93" }}>
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
                      <span className="text-sm">載入全班對話記錄中…</span>
                    </div>
                  ) : (
                  <ComparisonCharts
                    attempts={attempts}
                    assignments={assignments}
                    participant={participant}
                    allParticipants={allParticipantsRef.current}
                    allAttempts={allAttemptsRef.current}
                    chatLogs={chatLogs}
                    allClassChatLogs={[...chatLogs, ...(allClassChatLogsRef.current || [])]}
                  />
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* 任務進度 + 同班同學欄 */}
        <div className="flex gap-4 items-start mb-6">
          {/* Classmates column */}
          {(() => {
            const classmates = allParticipantsRef.current
              .filter(p => p.class_id === participant.class_id)
              .sort((a, b) => (a.student_id || "").localeCompare(b.student_id || ""));
            const classLabel = participant.class_id || "";
            return (
              <div className="w-10 flex-shrink-0 sticky top-4">
                <div className="rounded-xl p-1.5" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div className="flex flex-col items-center mb-2">
                    {classLabel.split("").map((ch, i) => (
                      <span key={i} className="text-xs font-bold leading-tight" style={{ color: "#aeaeb2" }}>{ch}</span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    {classmates.map(p2 => {
                      const p2Attempts = allAttemptsRef.current.filter(a => a.participant === p2.id);
                      // For each assignment, pick the latest attempt only (same logic as task cards)
                      const assignmentIds = [...new Set(p2Attempts.map(a => a.assignment))];
                      const latestPerAssignment = assignmentIds.map(aId =>
                        p2Attempts
                          .filter(a => a.assignment === aId)
                          .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0))[0]
                      );
                      const submitted = latestPerAssignment.filter(a => a && a.end_ts && (a.code_text || a.link_url));
                      const hasAny = submitted.length > 0;
                      const allGraded = hasAny && submitted.every(a => !!a.teacher_rating);
                      const isCurrent = p2.participant_id === participant.participant_id;
                      let boxClass = "bg-gray-100 border-gray-200 text-gray-300";
                      if (hasAny && allGraded) boxClass = "bg-orange-100 border-orange-400 text-orange-600";
                      else if (hasAny) boxClass = "bg-green-100 border-green-400 text-green-600";
                      if (isCurrent) boxClass += " ring-2 ring-indigo-500";
                      const tooltip = `${p2.name || p2.participant_id} (${p2.participant_id}${p2.student_id ? " · " + p2.student_id : ""}) · ${!hasAny ? "無提交" : allGraded ? "全部已評分" : "有未評分"}`;
                      return (
                        <button
                          key={p2.id}
                          title={tooltip}
                          onClick={() => { window.location.href = `/StudentDetailPage?id=${p2.participant_id}`; }}
                          className={`w-full h-6 rounded border text-xs font-bold transition hover:opacity-80 ${boxClass}`}
                        >
                          {hasAny ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 任務進度 */}
          <div className="flex-1 p-6" style={glassCard}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1d1d1f" }}>任務完成狀況</h2>
          <div className="space-y-4">
            {Object.keys(weekGroups).sort((a, b) => Number(a) - Number(b)).map(weekNum => {
              const allClassDates = loadAllClassDates();
              const classId = participant?.class_id;
              const weekDateStr = classId ? getClassWeekDate(allClassDates, classId, Number(weekNum)) : null;
              return (
              <div key={weekNum}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={{ color: "#3a3a3c" }}>
                    第 {weekNum} 週
                    {weekDateStr && (
                      <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ color: "#8e8e93", background: "rgba(0,0,0,0.05)" }}>
                        📅 {weekDateStr.slice(5).replace("-", "/")}
                      </span>
                    )}
                  </p>
                  <div className="relative">
                    {exportFormat === weekNum ? (
                      <div className="absolute right-0 top-8 rounded-xl shadow-lg z-10 min-w-32 overflow-hidden" style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(0,0,0,0.1)" }}>
                        <button onClick={() => exportWeekProgress(weekNum, "csv")} disabled={exportLoading === weekNum} className="w-full text-left text-xs px-3 py-2 disabled:opacity-50 transition font-medium" style={{ color: "#3a3a3c" }}>CSV</button>
                        <button onClick={() => exportWeekProgress(weekNum, "docx")} disabled={exportLoading === weekNum} className="w-full text-left text-xs px-3 py-2 disabled:opacity-50 transition font-medium" style={{ color: "#3a3a3c", borderTop: "1px solid rgba(0,0,0,0.06)" }}>DOCX</button>
                        <button onClick={() => exportWeekProgress(weekNum, "pdf")} disabled={exportLoading === weekNum} className="w-full text-left text-xs px-3 py-2 disabled:opacity-50 transition font-medium" style={{ color: "#3a3a3c", borderTop: "1px solid rgba(0,0,0,0.06)" }}>PDF</button>
                      </div>
                    ) : null}
                    <button
                      onClick={() => setExportFormat(exportFormat === weekNum ? null : weekNum)}
                      disabled={exportLoading === weekNum}
                      className="text-xs px-2.5 py-1 rounded-xl disabled:opacity-50 transition font-medium" style={{ background: "rgba(0,122,255,0.08)", color: "#007aff", border: "1px solid rgba(0,122,255,0.18)" }}
                    >
                      {exportLoading === weekNum ? "匯出中…" : "⬇ 匯出本週"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {weekGroups[weekNum].map(task => {
                    const status = getTaskStatus(task.id);
                    const taskAttempts = attempts
                      .filter(a => a.assignment === task.id)
                      .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0));
                    // 優先選擇「有提交內容」的那筆，避免點入空白 attempt
                    const attWithContent = taskAttempts.find(a => a.code_text || a.link_url);
                    const att = attWithContent || taskAttempts[0];
                    const hasMultiple = taskAttempts.length > 1;
                    return (
                      <div key={task.id} className="relative">
                        {/* 重疊陰影卡片（第 3 層） */}
                        {taskAttempts.length >= 3 && (
                          <div className={`absolute inset-0 rounded-lg border translate-x-2 translate-y-2 ${
                            status === "已完成" ? "bg-green-100 border-green-200" : "bg-gray-100 border-gray-200"
                          }`} style={{ zIndex: 1 }} />
                        )}
                        {/* 重疊陰影卡片（第 2 層） */}
                        {hasMultiple && (
                          <div className={`absolute inset-0 rounded-lg border translate-x-1 translate-y-1 ${
                            status === "已完成" ? "bg-green-100 border-green-200" : "bg-gray-100 border-gray-200"
                          }`} style={{ zIndex: 2 }} />
                        )}
                        {/* 主卡片 */}
                        <button
                          onClick={() => openAttemptModal(att)}
                          disabled={status === "未開放"}
                          className={`relative w-full p-3 rounded-lg border text-xs font-medium text-center transition flex flex-col items-center justify-center gap-1 ${
                            status === "已完成" && att?.teacher_rating
                              ? "bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                              : status === "已完成"
                              ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                              : status === "未開放"
                              ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60"
                              : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                          }`}
                          style={{ zIndex: 3, minHeight: "72px" }}
                        >
                          {hasMultiple && (
                            <span className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-bold leading-none">
                              ×{taskAttempts.length}
                            </span>
                          )}
                          <div>T{task.task_number}</div>
                          <div className="text-xs">{status}</div>
                          {/* 固定高度的標籤列：無論有無標籤都佔同樣空間 */}
                          <div className="flex flex-wrap justify-center gap-0.5 min-h-[18px]">
                            {(() => {
                              const gradedCount = att ? gradingRecords.filter(r => r.attempt_id === att.id).length : 0;
                              const hasRating = att?.teacher_rating || att?.teacher_feedback;
                              return (
                                <>
                                  {gradedCount > 0 && <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">✓ 已批改</span>}
                                  {hasRating && <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">✓ 已評分</span>}
                                </>
                              );
                            })()}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
          </div>{/* end 任務進度 */}
        </div>{/* end flex wrapper */}

        {/* 學生標記 & 質性紀錄 */}
        {participant && (
          <StudentNotesPanel participantDbId={participant.id} />
        )}

      </div>
    </div>
  );

  // Full-page attempt detail view
  if (selectedAttempt) {
    const assignment = getAssignment(selectedAttempt.assignment);
    const LABELS = { paste: "貼上程式碼", upload: "上傳截圖", link: "連結" };
    const types = selectedAttempt.submit_type ? selectedAttempt.submit_type.split(",").map(v => v.trim()) : [];
    const imageUrl = selectedAttempt.code_text?.split("\n").find(l => /^https?:\/\//.test(l.trim()));
    const pureCode = selectedAttempt.code_text?.split("\n").filter(l => !/^https?:\/\//.test(l.trim())).join("\n").trim();
    const note = exampleNotes.find(n => n.assignment_id === assignment?.assignment_id);

    return (
      <>
      <div style={glassBg}>
        {/* Top nav */}
        <div className="sticky top-0 z-10 px-6 py-4" style={{ background: "rgba(255,255,255,0.82)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <a href="/TeacherDashboard" className="text-sm transition" style={{ color: "#8e8e93" }}>← 返回教師看板</a>
            <span style={{ color: "#d1d1d6" }}>|</span>
            <button onClick={() => setSelectedAttempt(null)} className="text-sm transition font-medium" style={{ color: "#007aff" }}>← 返回該學生任務總覽</button>
            {(() => {
              const allSorted = assignments
                .filter(a => a.prompt_text)
                .sort((a, b) => a.week_number !== b.week_number ? a.week_number - b.week_number : a.task_number - b.task_number);
              const currentIdx = allSorted.findIndex(a => a.id === selectedAttempt.assignment);
              const prevAssignment = currentIdx > 0 ? allSorted[currentIdx - 1] : null;
              const nextAssignment = currentIdx >= 0 ? allSorted[currentIdx + 1] : null;
              return (
                <>
                  {prevAssignment && (() => {
                    const prevAttempt = attempts
                      .filter(a => a.assignment === prevAssignment.id)
                      .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0))[0];
                    if (!prevAttempt) return <span className="text-xs ml-2" style={{ color: "#aeaeb2" }}>← 上一任務 ({prevAssignment.assignment_id}) 尚未提交</span>;
                    return (
                      <button
                        onClick={() => openAttemptModal(prevAttempt)}
                        className="ml-2 text-sm font-medium transition" style={{ color: "#007aff" }}
                      >
                        ← 返回上一個任務 ({prevAssignment.assignment_id})
                      </button>
                    );
                  })()}
                  {nextAssignment && (() => {
                    const nextAttempt = attempts
                      .filter(a => a.assignment === nextAssignment.id)
                      .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0))[0];
                    if (!nextAttempt) return <span className="text-xs ml-2" style={{ color: "#aeaeb2" }}>下一任務 ({nextAssignment.assignment_id}) 尚未提交</span>;
                    return (
                      <button
                        onClick={() => openAttemptModal(nextAttempt)}
                        className="ml-2 text-sm font-medium transition" style={{ color: "#34c759" }}
                      >
                        接續下一個任務 ({nextAssignment.assignment_id}) →
                      </button>
                    );
                  })()}
                </>
              );
            })()}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  const sorted = allParticipantsRef.current.slice().sort((a, b) => (a.student_id || "").localeCompare(b.student_id || ""));
                  const curIdx = sorted.findIndex(p => p.participant_id === participant.participant_id);
                  if (curIdx >= 0 && curIdx < sorted.length - 1) {
                    const next = sorted[curIdx + 1];
                    const sameAssignmentAttempt = allAttemptsRef.current
                      .filter(a => a.participant === next.id && a.assignment === selectedAttempt.assignment)
                      .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0))[0];
                    if (sameAssignmentAttempt) {
                      window.location.href = `/StudentDetailPage?id=${next.participant_id}&attempt=${sameAssignmentAttempt.id}`;
                    } else {
                      window.location.href = `/StudentDetailPage?id=${next.participant_id}`;
                    }
                  } else {
                    alert("已是最後一位同學");
                  }
                }}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold transition" style={{ background: "rgba(0,0,0,0.05)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.10)" }}
              >
                下一位同學 →
              </button>
              <button
                onClick={() => {
                  if (gradingMode) {
                    handleEndGrading();
                  } else {
                    // Load latest grading content if exists
                    const latestGrading = gradingRecords
                      .filter(r => r.attempt_id === selectedAttempt.id)
                      .sort((a, b) => b.version - a.version)[0];
                    if (latestGrading) {
                      setCodeAnnotation(latestGrading.annotation || "");
                      // Draw canvas image after grading mode is set
                      if (latestGrading.canvas_image_url) {
                        setPendingCanvasUrl(latestGrading.canvas_image_url);
                      }
                    } else {
                      setCodeAnnotation("");
                      setNoteAnnotation("");
                    }
                    setGradingMode(true);
                  }
                }}
                disabled={savingGrading}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
                style={gradingMode ? { background: "#ff3b30", color: "#fff", border: "1px solid #ff3b30" } : { background: "rgba(255,59,48,0.06)", color: "#ff3b30", border: "1px solid rgba(255,59,48,0.25)" }}
              >
                {savingGrading ? "保存中…" : gradingMode ? "✅ 結束批改" : "📔 開始批改"}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1d1d1f" }}>任務詳情</h1>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-sm" style={{ color: "#3a3a3c" }}>{participant.name || participant.participant_id}</span>
            {participant.class_id && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.08)" }}>{participant.class_id}</span>
            )}
            {participant.group && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={participant.group === "AI_Pair" ? { background: "rgba(99,102,241,0.10)", color: "#4338ca", border: "1px solid rgba(99,102,241,0.2)" } : { background: "rgba(245,158,11,0.10)", color: "#92400e", border: "1px solid rgba(245,158,11,0.2)" }}>{participant.group}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,122,255,0.08)", color: "#007aff", border: "1px solid rgba(0,122,255,0.18)" }}>{assignment?.assignment_id || "—"}</span>
            {assignment?.title && <span className="text-sm" style={{ color: "#8e8e93" }}>{assignment.title}</span>}
          </div>

          <div className="flex gap-4 items-start">
            {/* Far left: all weeks task status */}
            <div className="w-14 flex-shrink-0 sticky top-4">
              <div className="p-2 space-y-3" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.08)" }}>
                {(() => {
                  const RATING_COLOR = {
                    "優": "bg-green-100 text-green-700 border-green-300",
                    "甲": "bg-blue-100 text-blue-700 border-blue-300",
                    "乙": "bg-yellow-100 text-yellow-700 border-yellow-300",
                    "丙": "bg-orange-100 text-orange-700 border-orange-300",
                    "丁": "bg-red-100 text-red-700 border-red-300",
                  };
                  return Object.keys(weekGroups).sort((a, b) => Number(a) - Number(b)).map(weekNum => {
                    const tasks = weekGroups[weekNum];
                    return (
                      <div key={weekNum}>
                        <p className="text-xs font-bold text-center mb-1" style={{ color: "#aeaeb2" }}>W{weekNum}</p>
                        <div className="flex flex-col gap-1">
                          {tasks.map(task => {
                            const att = attempts
                              .filter(a => a.assignment === task.id && (a.end_ts || a.teacher_rating))
                              .sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                            const rating = att?.teacher_rating;
                            const isCurrent = att && selectedAttempt && att.assignment === selectedAttempt.assignment;
                            const btnClass = isCurrent
                              ? "ring-2 ring-indigo-500 " + (rating ? RATING_COLOR[rating] : "bg-indigo-50 text-indigo-600 border-indigo-300")
                              : rating
                              ? RATING_COLOR[rating]
                              : att
                              ? "bg-green-50 text-green-600 border-green-200"
                              : "bg-gray-100 text-gray-300 border-gray-200";
                            return (
                              <button
                                key={task.id}
                                onClick={() => att && openAttemptModal(att)}
                                disabled={!att}
                                title={`T${task.task_number}: ${rating || (att ? "待評分" : "未提交")}`}
                                className={`w-full h-7 rounded border text-xs font-bold transition hover:opacity-80 disabled:cursor-not-allowed ${btnClass}`}
                              >
                                {rating || `T${task.task_number}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-6">
              <div className="p-6" style={glassCard}>
                 <h2 className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "#8e8e93" }}>基本資訊</h2>
                 <div className="grid grid-cols-3 gap-4">
                   <div>
                     <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>提交方式</p>
                     <p className="text-sm" style={{ color: "#3a3a3c" }}>{types.length > 0 ? types.map(t => LABELS[t] ?? t).join("、") : "—"}</p>
                   </div>
                   <div>
                     <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>開始時間</p>
                     <p className="text-sm" style={{ color: "#1d1d1f" }}>{new Date(selectedAttempt.start_ts).toLocaleString("zh-TW")}</p>
                   </div>
                   <div>
                     <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>完成時間</p>
                     <p className="text-sm" style={{ color: "#1d1d1f" }}>{selectedAttempt.end_ts ? new Date(selectedAttempt.end_ts).toLocaleString("zh-TW") : "—"}</p>
                   </div>
                 </div>
                 <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                   <p className="text-xs font-semibold mb-3" style={{ color: "#8e8e93" }}>AI 對話指標（ChatLog 計算）</p>
                   {(() => {
                     const attemptStats = getChatStatsByParticipant(chatLogs, participant.id, selectedAttempt.id);
                     return (
                       <div className="grid grid-cols-3 gap-3">
                         <div className="rounded-xl p-3 text-center" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                           <p className="text-xl font-bold" style={{ color: "#4338ca" }}>{attemptStats.conversation_active_minutes ?? 0}</p>
                           <p className="text-xs mt-0.5" style={{ color: "#6366f1" }}>對話時間（分）</p>
                         </div>
                         <div className="rounded-xl p-3 text-center" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>
                           <p className="text-xl font-bold" style={{ color: "#7c3aed" }}>{attemptStats.user_message_count ?? 0}</p>
                           <p className="text-xs mt-0.5" style={{ color: "#a855f7" }}>學生訊息數</p>
                         </div>
                         <div className="rounded-xl p-3 text-center" style={{ background: "rgba(0,122,255,0.08)", border: "1px solid rgba(0,122,255,0.15)" }}>
                           <p className="text-xl font-bold" style={{ color: "#007aff" }}>{attemptStats.conversation_sessions ?? 0}</p>
                           <p className="text-xs mt-0.5" style={{ color: "#007aff" }}>對話段數</p>
                         </div>
                       </div>
                     );
                   })()}
                </div>

                {/* Week Timeline */}
                {(() => {
                  const currentAssignment = getAssignment(selectedAttempt.assignment);
                  const weekNum = currentAssignment?.week_number;
                  if (!weekNum) return null;
                  const weekTasks = (weekGroups[weekNum] || []).slice().sort((a, b) => a.task_number - b.task_number);
                  if (weekTasks.length === 0) return null;

                  // Gather all week attempts with start times
                  const taskData = weekTasks.map(task => {
                    const att = attempts
                      .filter(a => a.assignment === task.id)
                      .sort((a, b) => (b.redo_count || 0) - (a.redo_count || 0))[0];
                    return { task, att };
                  }).filter(d => d.att?.start_ts);

                  if (taskData.length === 0) return null;

                  // Find time range for the whole week
                  const allStarts = taskData.map(d => new Date(d.att.start_ts).getTime());
                  const allEnds = taskData.filter(d => d.att.end_ts).map(d => new Date(d.att.end_ts).getTime());
                  const minTime = Math.min(...allStarts);
                  const maxTime = allEnds.length > 0 ? Math.max(...allEnds, ...allStarts) : Math.max(...allStarts);
                  const totalSpan = maxTime - minTime || 1;

                  const allClassDatesLocal = loadAllClassDates();
                  const classId = participant?.class_id;
                  const weekPeriods = getClassWeekPeriods(allClassDatesLocal, classId, weekNum);
                  const weekDateStr = getClassWeekDate(allClassDatesLocal, classId, weekNum);

                  // Check if a timestamp is within any class period on the class day
                  const isInClassTime = (ts) => {
                    if (!weekDateStr || !weekPeriods.length || !ts) return false;
                    const d = new Date(ts);
                    const dateStr = d.toISOString().split("T")[0];
                    if (dateStr !== weekDateStr) return false;
                    const totalMins = d.getHours() * 60 + d.getMinutes();
                    return weekPeriods.some(pn => {
                      const info = PERIODS.find(p => p.num === pn);
                      if (!info) return false;
                      const [s, e] = info.time.split("~");
                      const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
                      return totalMins >= toMin(s) && totalMins <= toMin(e);
                    });
                  };

                  const fmtTime = (ts) => new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
                  const fmtDate = (ts) => new Date(ts).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
                  const durMin = (att) => {
                    if (!att.end_ts) return null;
                    return Math.round((new Date(att.end_ts) - new Date(att.start_ts)) / 60000);
                  };

                  return (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold text-gray-500">第 {weekNum} 週任務時間軸</p>
                        <button
                          onClick={() => setCollapsedTimeline(c => !c)}
                          className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition"
                        >
                          {collapsedTimeline ? "▶ 展開" : "▼ 收合"}
                        </button>
                      </div>
                      {!collapsedTimeline && <div className="space-y-3">
                        {taskData.map(({ task, att }) => {
                          const start = new Date(att.start_ts).getTime();
                          const end = att.end_ts ? new Date(att.end_ts).getTime() : null;
                          const leftPct = ((start - minTime) / totalSpan) * 100;
                          const widthPct = end ? Math.max(((end - start) / totalSpan) * 100, 1.5) : 1.5;
                          const dur = durMin(att);
                          const aiMins = att.ai_used ? (att.ai_minutes ?? 0) : 0;
                          const aiWidthPct = end && dur ? Math.min((aiMins / dur) * widthPct, widthPct) : 0;
                          const isCurrent = att.id === selectedAttempt.id;
                          return (
                            <div key={task.id}>
                              {/* Label row */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-bold w-7 flex-shrink-0 ${isCurrent ? "text-indigo-700" : "text-gray-500"}`}>
                                  T{task.task_number}
                                </span>
                                <span className={`text-xs font-mono ${isCurrent ? "text-indigo-600 font-semibold" : "text-gray-500"}`}>
                                    {fmtTime(start)}{end ? ` → ${fmtTime(end)}` : ""}
                                  </span>
                                  {dur != null && <span className="text-xs text-gray-400">({dur}分)</span>}
                                  {aiMins > 0 && <span className="text-xs text-purple-500 font-medium">🤖{aiMins}分</span>}
                                  {end && weekDateStr && weekPeriods.length > 0 && !isInClassTime(end) && (
                                    <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium">⚠ 非上課時間完成</span>
                                  )}
                              </div>
                              {/* Bar row */}
                              <div className="flex items-center gap-2">
                                <div className="w-7 flex-shrink-0" />
                                <div className="flex-1 relative" style={{ height: "14px" }}>
                                  <div className="absolute inset-0 rounded-full bg-gray-100" />
                                  {/* Task bar with tooltip */}
                                  <div
                                    className={`absolute top-0 h-full rounded-full transition-all cursor-pointer group/task ${isCurrent ? "bg-indigo-200 hover:bg-indigo-300" : "bg-blue-100 hover:bg-blue-200"}`}
                                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "6px" }}
                                  >
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/task:block z-20 pointer-events-none">
                                      <div className="bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                                        <p className="font-semibold">T{task.task_number} 作答時間</p>
                                        <p className="text-gray-300">{fmtDate(start)} {fmtTime(start)} {end ? `→ ${fmtTime(end)}` : "（未完成）"}</p>
                                        {dur != null && <p className="text-blue-300">共 {dur} 分鐘</p>}
                                      </div>
                                      <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1" />
                                    </div>
                                  </div>
                                  {/* AI bar with tooltip */}
                                  {aiWidthPct > 0 && (
                                    <div
                                      className="absolute top-0 h-full rounded-full bg-purple-400 opacity-70 hover:opacity-100 cursor-pointer group/ai"
                                      style={{ left: `${leftPct}%`, width: `${aiWidthPct}%`, minWidth: "4px" }}
                                    >
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/ai:block z-20 pointer-events-none">
                                        <div className="bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                                          <p className="font-semibold text-purple-300">🤖 AI 使用時間</p>
                                          <p className="text-purple-200">{aiMins} 分鐘</p>
                                          {dur != null && <p className="text-gray-400">佔作答 {Math.round(aiMins / dur * 100)}%</p>}
                                        </div>
                                        <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1" />
                                      </div>
                                    </div>
                                  )}
                                  <div
                                    className={`absolute top-0.5 bottom-0.5 w-0.5 rounded-full ${isCurrent ? "bg-indigo-500" : "bg-blue-400"}`}
                                    style={{ left: `calc(${leftPct}% - 1px)` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>}
                      {!collapsedTimeline && (
                      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-blue-200" />
                          <span className="text-xs text-gray-400">任務作答時間</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-purple-400 opacity-70" />
                          <span className="text-xs text-gray-400">AI 使用時間</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-indigo-200" />
                          <span className="text-xs text-gray-400">當前任務</span>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {assignment?.prompt_text && (
                 <div className="p-6" style={{ ...glassCard, background: "rgba(255,244,220,0.8)", border: "1px solid rgba(245,158,11,0.25)" }}>
                   <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#d97706" }}>📝 任務內容</p>
                   <p className="text-sm whitespace-pre-wrap" style={{ color: "#1d1d1f" }}>{assignment.prompt_text}</p>
                  {/* 任務圖片（可折疊） */}
                  {(() => {
                    const imgFields = [
                      { url: assignment.assignment_image_url, label: assignment.assignment_image_label },
                      { url: assignment.assignment_image_url2, label: assignment.assignment_image_label2 },
                      { url: assignment.assignment_image_url3, label: assignment.assignment_image_label3 },
                      { url: assignment.assignment_image_url4, label: assignment.assignment_image_label4 },
                      { url: assignment.assignment_image_url5, label: assignment.assignment_image_label5 },
                    ].filter(f => f.url);
                    if (imgFields.length === 0) return null;
                    return (
                      <details className="mt-4 border-t border-amber-200 pt-3">
                        <summary className="text-xs font-semibold text-amber-600 cursor-pointer select-none hover:text-amber-800 transition list-none flex items-center gap-1">
                          <span>🖼 任務圖片（{imgFields.length} 張，點擊展開）</span>
                        </summary>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {imgFields.map((f, i) => (
                            <div key={i} className="flex flex-col gap-1">
                              {f.label && <p className="text-xs text-amber-600 font-medium">{f.label}</p>}
                              <img src={f.url} alt={f.label || `圖片 ${i + 1}`} className="max-w-xs rounded-lg border border-amber-200 object-contain cursor-pointer hover:opacity-90 transition" onClick={() => window.open(f.url, '_blank')} />
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })()}
                </div>
              )}

              {pureCode && (() => {
                const latestGrading = gradingRecords.filter(r => r.attempt_id === selectedAttempt.id).sort((a, b) => b.version - a.version)[0];
                return (
                <div className="p-6" style={glassCard}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#8e8e93" }}>程式碼
                    {gradingMode && <span className="ml-2 text-red-400 font-normal text-xs">（批改模式：可直在下方輸入紅色批註）</span>}
                    {!gradingMode && latestGrading?.annotation && <span className="ml-2 text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-200">📔 已批改 v{latestGrading.version}</span>}
                  </p>
                  <div className="flex bg-gray-900 rounded-lg overflow-x-auto text-xs">
                    <div className="select-none text-gray-500 text-right px-3 py-4 border-r border-gray-700" style={{ minWidth: "2.8rem", lineHeight: "1.5rem" }}>
                      {pureCode.split("\n").map((_, i) => (
                        <div key={i} style={{ lineHeight: "1.5rem" }}>{i + 1}</div>
                      ))}
                    </div>
                    <pre className="text-gray-100 px-4 py-4 overflow-x-auto whitespace-pre flex-1" style={{ lineHeight: "1.5rem" }}>{pureCode}</pre>
                  </div>
                  {gradingMode && (
                    <textarea
                      value={codeAnnotation}
                      onChange={e => setCodeAnnotation(e.target.value)}
                      placeholder="輸入批註意見，例： L3: 變數名稱應更明確..."
                      rows={4}
                      className="w-full mt-3 px-3 py-2 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-red-50"
                      style={{ color: "#dc2626" }}
                    />
                  )}
                  {!gradingMode && latestGrading?.annotation && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-semibold text-red-500 mb-1">📔 批註 · v{latestGrading.version} · {new Date(latestGrading.graded_at).toLocaleString('zh-TW')}</p>
                      <pre className="text-xs whitespace-pre-wrap font-mono" style={{ color: '#dc2626' }}>{latestGrading.annotation}</pre>
                    </div>
                  )}
                </div>
                );
              })()}

              {imageUrl && (() => {
                const latestGrading = gradingRecords.filter(r => r.attempt_id === selectedAttempt.id).sort((a, b) => b.version - a.version)[0];
                return (
                <div className="p-6" style={glassCard}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#8e8e93" }}>上傳截圖
                    {gradingMode && <span className="ml-2 text-red-400 font-normal text-xs">（可用紅色畫筆標注）</span>}
                    {!gradingMode && latestGrading?.canvas_image_url && <span className="ml-2 text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-200">📔 已標註 v{latestGrading.version}</span>}
                  </p>
                  {gradingMode && (
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <button onClick={() => { setDrawTool("pen"); setBrushSize(4); }} className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${ drawTool === "pen" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50" }`}>🖊️ 畫筆</button>
                      <button onClick={() => { setDrawTool("rect"); setBrushSize(2); }} className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${ drawTool === "rect" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50" }`}>⬜ 方框</button>
                      <button onClick={() => { setDrawTool("text"); setBrushSize(20); }} className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${ drawTool === "text" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50" }`}>T 文字</button>
                      <button onClick={() => { setDrawTool("eraser"); }} className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${ drawTool === "eraser" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50" }`}>🧹 橡皮擦</button>
                      {(drawTool === "pen" || drawTool === "rect" || drawTool === "eraser") && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{drawTool === "rect" ? "框線：" : "粗細："}</span>
                          {[1, 2, 4, 8, 14].map(size => (
                            <button key={size} onClick={() => { setBrushSize(size); }} className={`rounded-full border-2 transition ${ brushSize === size ? "border-red-500" : "border-gray-300" }`} style={{ width: size + 12, height: size + 12, background: brushSize === size ? "#ef4444" : "#e5e7eb" }} />
                          ))}
                        </div>
                      )}
                      {drawTool === "text" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">字級：</span>
                          {[12, 16, 20, 28, 40].map(size => (
                            <button key={size} onClick={() => setBrushSize(size)} className={`px-2 py-0.5 rounded border text-xs font-medium transition ${ brushSize === size ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50" }`}>{size}</button>
                          ))}
                        </div>
                      )}
                      <button onClick={clearCanvas} className="ml-auto text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition">🗑 清除全部</button>
                    </div>
                  )}
                  <div className="relative inline-block max-w-full">
                    <img ref={imageRef} src={imageUrl} alt="學生提交截圖" className="max-w-full rounded-lg border border-gray-200 object-contain block" />
                    {!gradingMode && latestGrading?.canvas_image_url && (
                      <img src={latestGrading.canvas_image_url} alt="批改標註" className="absolute inset-0 w-full h-full rounded-lg object-contain pointer-events-none" />
                    )}
                    {gradingMode && (
                      <AnnotationCanvas
                        ref={annotationCanvasRef}
                        imageRef={imageRef}
                        brushSize={brushSize}
                        drawTool={drawTool}
                        onHasContent={setCanvasHasContent}
                      />
                    )}
                  </div>
                  {!gradingMode && latestGrading?.canvas_image_url && (
                    <p className="text-xs text-red-400 mt-2">📔 標註版本 v{latestGrading.version} · {new Date(latestGrading.graded_at).toLocaleString('zh-TW')}</p>
                  )}
                </div>
                );
              })()}

              {selectedAttempt.link_url && (
                 <div className="p-6" style={glassCard}>
                   <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#8e8e93" }}>連結</p>
                   <a href={selectedAttempt.link_url} target="_blank" rel="noopener noreferrer" className="text-sm break-all hover:underline" style={{ color: "#007aff" }}>{selectedAttempt.link_url}</a>
                 </div>
               )}

              {selectedAttempt.notes && (() => {
                const latestGrading = gradingRecords.filter(r => r.attempt_id === selectedAttempt.id).sort((a, b) => b.version - a.version)[0];
                return (
                <div className="p-6" style={glassCard}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#8e8e93" }}>備註
                    {gradingMode && <span className="ml-2 text-red-400 font-normal text-xs">（可在下方加入備註批註）</span>}
                    {!gradingMode && latestGrading?.note_annotation && <span className="ml-2 text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-200">📔 已批註 v{latestGrading.version}</span>}
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedAttempt.notes}</p>
                  {gradingMode && (
                    <textarea
                      value={noteAnnotation}
                      onChange={e => setNoteAnnotation(e.target.value)}
                      placeholder="輸入備註批註…"
                      rows={3}
                      className="w-full mt-3 px-3 py-2 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-red-50"
                      style={{ color: "#dc2626" }}
                    />
                  )}
                  {!gradingMode && latestGrading?.note_annotation && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-semibold text-red-500 mb-1">📔 備註批註 · v{latestGrading.version} · {new Date(latestGrading.graded_at).toLocaleString('zh-TW')}</p>
                      <pre className="text-xs whitespace-pre-wrap font-mono" style={{ color: '#dc2626' }}>{latestGrading.note_annotation}</pre>
                    </div>
                  )}
                </div>
                );
              })()}

              {note && (
                 <div className="p-6" style={{ ...glassCard, background: "rgba(235,240,255,0.8)", border: "1px solid rgba(99,102,241,0.2)" }}>
                   <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#4338ca" }}>📝 學生程式筆記</p>
                   <pre className="text-xs whitespace-pre-wrap font-mono" style={{ color: "#1d1d1f" }}>{note.content}</pre>
                   <p className="text-xs mt-3" style={{ color: "#aeaeb2" }}>最後更新：{new Date(note.submitted_at || note.updated_date).toLocaleString('zh-TW')}</p>
                 </div>
               )}

              {(() => {
                const attemptGradings = gradingRecords.filter(r => r.attempt_id === selectedAttempt.id).sort((a, b) => a.version - b.version);
                if (attemptGradings.length === 0) return null;
                return (
                  <div className="p-6" style={{ ...glassCard, background: "rgba(255,240,240,0.8)", border: "1px solid rgba(255,59,48,0.2)" }}>
                     <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#ff3b30" }}>📔 批改紀錄</p>
                     <div className="space-y-4">
                       {attemptGradings.map(record => (
                         <div key={record.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,59,48,0.12)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">v{record.version}</span>
                            <span className="text-xs text-gray-400">{new Date(record.graded_at).toLocaleString('zh-TW')}</span>
                          </div>
                          {record.annotation && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-gray-500 mb-1">程式碼批註</p>
                              <pre className="text-xs whitespace-pre-wrap font-mono p-2 bg-red-50 rounded border border-red-100" style={{ color: '#dc2626' }}>{record.annotation}</pre>
                            </div>
                          )}
                          {record.note_annotation && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-gray-500 mb-1">備註批註</p>
                              <pre className="text-xs whitespace-pre-wrap font-mono p-2 bg-red-50 rounded border border-red-100" style={{ color: '#dc2626' }}>{record.note_annotation}</pre>
                            </div>
                          )}
                          {record.canvas_image_url && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1">截圖標註</p>
                              <img src={record.canvas_image_url} alt="批改截圖" className="max-w-full rounded border border-red-200" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right: feedback panel */}
            <div className="w-80 flex-shrink-0 sticky top-4 space-y-4">
              {/* Week Score Summary */}
              {(() => {
                const RATING_SCORE = { 優: 9.5, 甲: 8.5, 乙: 7.5, 丙: 6.5, 丁: 5.5 };
                const currentAssignment = getAssignment(selectedAttempt.assignment);
                const weekNum = currentAssignment?.week_number || 1;
                const weekTasks = (weekGroups[weekNum] || []);
                if (weekTasks.length === 0) return null;
                const taskCount = weekTasks.length;
                const taskScores = weekTasks.map(task => {
                  const att = attempts.find(a => a.assignment === task.id && (a.end_ts || a.teacher_rating));
                  const rating = att?.teacher_rating;
                  const score = rating ? RATING_SCORE[rating] : null;
                  return { task, att, rating, score };
                });
                const rawScore = taskScores.reduce((sum, t) => sum + (t.score ?? 0), 0);
                const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                const gradedCount = taskScores.filter(t => t.rating).length;
                return (
                  <div className="p-5" style={glassCard}>
                     <h2 className="text-sm font-semibold mb-3" style={{ color: "#1d1d1f" }}>W{weekNum} 批改總覽</h2>
                     <div className="mb-4 p-3 rounded-xl text-center" style={{ background: "rgba(0,122,255,0.08)", border: "1px solid rgba(0,122,255,0.18)" }}>
                       <p className="text-xs mb-1" style={{ color: "#007aff" }}>W{weekNum} 總分（滿分100）</p>
                       <p className="text-3xl font-bold" style={{ color: "#007aff" }}>{gradedCount > 0 ? totalScore.toFixed(1) : '—'}</p>
                      {taskCount < 10 && gradedCount > 0 && (
                        <p className="text-xs text-blue-400 mt-1">原始 {rawScore.toFixed(1)} × (10/{taskCount})</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">已評分 {gradedCount}/{taskCount} 題</p>
                    </div>
                    <div className="space-y-1.5">
                      {taskScores.map(({ task, att, rating, score }) => {
                        const gradingCount = att ? gradingRecords.filter(r => r.attempt_id === att.id).length : 0;
                        return (
                          <div key={task.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-600">T{task.task_number}</span>
                              {gradingCount > 0 && <span className="text-red-400">📔</span>}
                              {!att && <span className="text-gray-300">未提交</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {rating ? (
                                <>
                                  <span className={`px-1.5 py-0.5 rounded font-bold border ${
                                    rating === '優' ? 'bg-green-100 text-green-700 border-green-300' :
                                    rating === '甲' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                    rating === '乙' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                    rating === '丙' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                    'bg-red-100 text-red-700 border-red-200'
                                  }`}>{rating}</span>
                                  <span className="text-gray-500">{score}</span>
                                </>
                              ) : att ? (
                                <span className="text-gray-300">未評分</span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">教師評語與評分</h2>
                  <button
                    onClick={() => setShowTemplateManager(true)}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition"
                  >
                    ⚙️ 管理評語
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500">評語與建議</p>
                    <div className="flex gap-1">
                    <button
                      onClick={() => setShowPromptSettings(true)}
                      title="設定 AI 提示詞"
                      className="text-xs px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition font-medium"
                    >⚙️{selectedPromptId ? " ✓" : ""}</button>
                    <button
                      onClick={async () => {
                        if (!selectedAttempt || generatingFeedback) return;
                        const assignment = getAssignment(selectedAttempt.assignment);
                        const pureCode = selectedAttempt.code_text?.split("\n").filter(l => !/^https?:\/\//.test(l.trim())).join("\n").trim();
                        if (!pureCode) { alert("沒有程式碼可分析"); return; }
                        setGeneratingFeedback(true);
                        clearTimeout(aiRainbowFadeRef.current);
                        setAiRainbowState('on');
                        try {
                          const res = await base44.functions.invoke('generateFeedback', {
                            code: pureCode,
                            assignmentTitle: assignment?.title || assignment?.assignment_id || "作業",
                            promptText: assignment?.prompt_text || "",
                            rubric: assignment?.rubric || "",
                            answer: assignment?.answer || "",
                            styleInstruction: selectedPromptContent || "",
                          });
                          const feedback = res.data?.feedback || res.data;
                          const suggestedRating = res.data?.suggestedRating;
                          setFeedbackInput(prev => prev ? prev + "\n\n---\n" + feedback : feedback);
                          if (suggestedRating) {
                            setRatingInput(suggestedRating);
                          }
                        } catch (err) {
                          alert("無法生成評語：" + err.message);
                        } finally {
                          setGeneratingFeedback(false);
                          playAiSound();
                          setAiRainbowState('fading');
                          aiRainbowFadeRef.current = setTimeout(() => setAiRainbowState('off'), 2000);
                        }
                      }}
                      disabled={generatingFeedback || !selectedAttempt || !selectedAttempt.code_text}
                      className="text-xs px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition font-medium"
                    >
                      {generatingFeedback ? "⏳ 生成中..." : "✨ AI 回饋"}
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedAttempt || generatingRating) return;
                        const assignment = getAssignment(selectedAttempt.assignment);
                        const pureCode = selectedAttempt.code_text?.split("\n").filter(l => !/^https?:\/\//.test(l.trim())).join("\n").trim();
                        if (!pureCode) { alert("沒有程式碼可分析"); return; }
                        setGeneratingRating(true);
                        clearTimeout(aiRatingFadeRef.current);
                        setAiRatingState('on');
                        try {
                          const res = await base44.functions.invoke('generateFeedback', {
                            code: pureCode,
                            assignmentTitle: assignment?.title || assignment?.assignment_id || '作業',
                            promptText: assignment?.prompt_text || "",
                            rubric: assignment?.rubric || "",
                            answer: assignment?.answer || "",
                            mode: 'ratingOnly',
                            questionType: assignment?.question_type || 'CodeProblem',
                          });
                          const rating = res.data?.suggestedRating;
                          if (rating) {
                            setRatingInput(rating);
                            playAiSound();
                            setAiRatingState('fading');
                            aiRatingFadeRef.current = setTimeout(() => setAiRatingState('off'), 2000);
                          } else {
                            alert('無法解析等第，請再試一次');
                          }
                        } catch (err) {
                          alert('無法生成等第：' + err.message);
                        } finally {
                          setGeneratingRating(false);
                        }
                      }}
                      disabled={generatingRating || !selectedAttempt || !selectedAttempt.code_text}
                      className="text-xs px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition font-medium"
                    >
                      {generatingRating ? "⏳ 評分中..." : "🏅 AI等第"}
                    </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {feedbackTemplates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFeedbackInput(prev => prev ? prev + "\n" + t.content : t.content)}
                        className="text-xs px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                      >
                        + {t.content}
                      </button>
                    ))}
                  </div>
                  <div className={`rounded-lg ${
                    aiRainbowState === 'on' ? 'rainbow-border' :
                    aiRainbowState === 'fading' ? 'rainbow-border rainbow-border--fading' : ''
                  }`}>
                  <textarea
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    placeholder="輸入評語和建議…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={6}
                  />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">評分</p>
                  <div className={`rounded-lg ${
                    aiRatingState === 'on' ? 'rainbow-border' :
                    aiRatingState === 'fading' ? 'rainbow-border rainbow-border--fading' : ''
                  }`}>
                  <select
                    value={ratingInput}
                    onChange={(e) => setRatingInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">選擇評分…</option>
                    <option value="優">優</option>
                    <option value="甲">甲</option>
                    <option value="乙">乙</option>
                    <option value="丙">丙</option>
                    <option value="丁">丁</option>
                  </select>
                  </div>
                </div>
                <button
                  onClick={handleSaveFeedback}
                  disabled={savingFeedback || (!feedbackInput.trim() && ratingInput === "")}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {savingFeedback ? "保存中…" : feedbackSaved ? "✅ 已保存" : "💾 保存評語與評分"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showTemplateManager && (
        <FeedbackTemplateManager
          onClose={() => { setShowTemplateManager(false); loadTemplates(); }}
        />
      )}
      {showPromptSettings && (
        <FeedbackPromptSettings
          selectedId={selectedPromptId}
          onSelect={(id, content) => { setSelectedPromptId(id); setSelectedPromptContent(content); }}
          onClose={() => setShowPromptSettings(false)}
        />
      )}
      </>
    );
  }

  return (
    <>
      {mainView}
      {showTemplateManager && (
        <FeedbackTemplateManager
          onClose={() => { setShowTemplateManager(false); loadTemplates(); }}
        />
      )}
      {pretestModal && (
        <PretestDetailModal
          type={pretestModal}
          quizResults={quizResults.filter(q => q.survey_type === "pre")}
          scaleResponses={scaleResponses.filter(s => s.survey_type === "pre")}
          postQuizResults={quizResults.filter(q => q.survey_type === "post")}
          postScaleResponses={scaleResponses.filter(s => s.survey_type === "post")}
          questionBank={questionBank}
          onClose={() => setPretestModal(null)}
          hidePreTab={pretestModal === "collaboration"}
        />
      )}
    </>
  );
}