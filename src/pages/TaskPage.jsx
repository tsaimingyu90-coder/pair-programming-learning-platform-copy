import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Unified helper: resolve assignment ID from various object shapes
const getAssignmentId = (obj) =>
  obj?.assignment?.id || obj?.assignment || obj?.assignment_id;
import { perfStart, logPerf, withTimeout } from "@/hooks/usePerf";
import { useNetworkMode } from "@/hooks/useNetworkMode";
import DegradedBanner from "@/components/DegradedBanner";
import PreviewBanner from "@/components/PreviewBanner";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { createPageUrl } from "@/utils";
import GeminiInput from "@/components/GeminiInput";
import EditableCodeBlock from "@/components/EditableCodeBlock";
import LatexRenderer from "@/components/LatexRenderer";
import CCompiler from "@/components/CCompiler";
import CodePreview from "@/components/CodePreview";
import UserPromptManager from "@/components/UserPromptManager";
import { LanguageSelector, getHighlightedLines } from "@/components/SyntaxHighlighter";
import { usePreviewMode } from "@/hooks/usePreviewMode";

const DEFAULT_INTERVAL_SECS = 600;

const SUBMIT_TYPE_LABELS = { paste: "貼上程式碼", upload: "上傳截圖", link: "連結" };

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function TaskPage() {
  const { isPreview, previewSessionId, previewParticipant } = usePreviewMode();
  const [participant, setParticipant] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [session, setSession] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [redoCount, setRedoCount] = useState(0);
  const [phase, setPhase] = useState("pre");
  const [form, setForm] = useState({
    code_text: "",
    submit_type: [],
    link_url: "",
    difficulty: 4,
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("正在讀取任務內容...");
  const [duration, setDuration] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [exampleImageCollapsed, setExampleImageCollapsed] = useState(true);
  const [assignmentImageCollapsed, setAssignmentImageCollapsed] = useState(true);
  const [floatingImageUrl, setFloatingImageUrl] = useState(null);
  const [exampleCollapsed, setExampleCollapsed] = useState(false);
  const [assignmentCollapsed, setAssignmentCollapsed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [compilerTab, setCompilerTab] = useState("simulator");
  const [lightboxImages, setLightboxImages] = useState([]); // all browsable images
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxUrl = lightboxImages[lightboxIndex] ?? null;
  // group: "example" | "assignment" | "upload" | null — restricts navigation scope
  const openLightbox = (url, group) => {
    if (!url) { setLightboxImages([]); return; }
    let imgs = [];
    if (group === "example" && assignment) {
      imgs = [assignment.example_image_url, assignment.example_image_url2, assignment.example_image_url3, assignment.example_image_url4, assignment.example_image_url5].filter(Boolean);
    } else if (group === "assignment" && assignment) {
      imgs = [assignment.assignment_image_url, assignment.assignment_image_url2, assignment.assignment_image_url3, assignment.assignment_image_url4, assignment.assignment_image_url5].filter(Boolean);
    } else if (group === "upload" && existingAttempt?.code_text) {
      const imgLine = existingAttempt.code_text.split("\n").find(l => /^https?:\/\//.test(l.trim()));
      imgs = imgLine ? [imgLine] : [url];
    } else {
      imgs = [url];
    }
    const idx = imgs.indexOf(url);
    setLightboxImages(imgs);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };
  // Legacy alias (upload image clicks)
  const setLightboxUrl = (url) => openLightbox(url, "upload");
  const [gradingRecords, setGradingRecords] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [ratingJustArrived, setRatingJustArrived] = useState(false);

  const [showPromptManager, setShowPromptManager] = useState(false);
  const [localQueueCount, setLocalQueueCount] = useState(0);
  const [codeLanguage, setCodeLanguage] = useState('c');
  const [codeTheme, setCodeTheme] = useState('light');
  const [mobileFloatingOpen, setMobileFloatingOpen] = useState(false);
  const [isMdOrAbove, setIsMdOrAbove] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e) => setIsMdOrAbove(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  const [exampleBlockBottom, setExampleBlockBottom] = useState(null);
  const exampleBlockRef = useRef(null);
  const saveDraftInline = useRef(null);
   const isMountedRef = useRef(true);
   const { isDegradedMode, recordFailure, recordSuccess } = useNetworkMode();

  const showNotice = (msg) => {
    setNotice(msg);
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxImages.length === 0) return;
    const handler = (e) => {
      if (e.key === "ArrowRight") setLightboxIndex(i => (i + 1) % lightboxImages.length);
      else if (e.key === "ArrowLeft") setLightboxIndex(i => (i - 1 + lightboxImages.length) % lightboxImages.length);
      else if (e.key === "Escape") setLightboxImages([]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxImages]);

  // Track example block bottom position for floating image alignment
  useEffect(() => {
    const el = exampleBlockRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setExampleBlockBottom(rect.bottom);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [assignment]);

  // Timer state
  const [totalSecs, setTotalSecs] = useState(0);
  const [intervalSecs, setIntervalSecs] = useState(0);
  const [rolePhase, setRolePhase] = useState(0);
  const [intervalSecs_max, setIntervalSecs_max] = useState(DEFAULT_INTERVAL_SECS);
  const intervalSecs_maxRef = useRef(DEFAULT_INTERVAL_SECS);
  const timerRef = useRef(null);

  // Inline draft helpers
  const loadDraftInline = (pId, aId) => {
    try { return JSON.parse(localStorage.getItem(`draft_${pId}_${aId}`) || "null"); } catch { return null; }
  };
  const clearDraftInline = (pId, aId) => {
    try { localStorage.removeItem(`draft_${pId}_${aId}`); } catch {}
  };
  const enqueueSync = (pId, item) => {
    const k = `sync_queue_${pId}`;
    try {
      const q = JSON.parse(localStorage.getItem(k) || "[]");
      q.push({ ...item, participantId: pId, createdAt: Date.now(), id: Math.random().toString(36).slice(2) });
      localStorage.setItem(k, JSON.stringify(q));
    } catch {}
  };

  // Get URL parameters — pid from URL only (no localStorage fallback)
  const urlParams = new URLSearchParams(window.location.search);
  const weekNumber = urlParams.get("week");
  const taskNumber = urlParams.get("task");
  const pidFromUrl = urlParams.get("pid");
  const urlPreviewFlag = urlParams.get("preview") === "1";

  useEffect(() => {
    console.log("[TaskPage] mounted", { weekNumber, taskNumber });
    isMountedRef.current = true;
    window.scrollTo(0, 0);

    // Load timing settings in background (non-blocking)
    base44.entities.TimingSettings.list().then(data => {
      if (data.length > 0 && data[0].role_swap_interval) {
        setIntervalSecs_max(data[0].role_swap_interval);
        intervalSecs_maxRef.current = data[0].role_swap_interval;
      }
    });

    const loadData = async () => {
      if (!weekNumber || !taskNumber) {
        setNotFound(true);
        return;
      }

      // Load participant: from URL pid or localStorage fallback
      let parsedParticipant = null;
      if (pidFromUrl) {
        try {
          parsedParticipant = await base44.entities.Participant.get(pidFromUrl);
          if (parsedParticipant) {
            setParticipant(parsedParticipant);
            console.log("[TaskPage] participant loaded from URL pid", parsedParticipant.participant_id);
            try {
              const q = JSON.parse(localStorage.getItem(`sync_queue_${parsedParticipant.participant_id}`) || "[]");
              setLocalQueueCount(q.length);
            } catch {}
          }
        } catch (err) {
          console.error("[TaskPage] Failed to load participant by pid:", err);
        }
      }
      // Fallback: sessionStorage
      if (!parsedParticipant) {
        const p = sessionStorage.getItem("participant");
        parsedParticipant = p ? JSON.parse(p) : null;
        if (parsedParticipant) {
          setParticipant(parsedParticipant);
          console.log("[TaskPage] participant loaded from sessionStorage", parsedParticipant.participant_id);
          try {
            const q = JSON.parse(localStorage.getItem(`sync_queue_${parsedParticipant.participant_id}`) || "[]");
            setLocalQueueCount(q.length);
          } catch {}
        }
      }
      // Fallback for preview mode: use preview context participant
      if (!parsedParticipant && (isPreview || urlPreviewFlag) && previewParticipant) {
        parsedParticipant = previewParticipant;
        setParticipant(parsedParticipant);
        console.log("[TaskPage] participant loaded from preview context", parsedParticipant.participant_id);
      }

      // Phase 1: Assignment only — unblocks first render immediately
      const _pageT0 = perfStart();
      console.log("[TaskPage] assignment request start");
      const t0 = Date.now();
      setLoadingStatus("正在讀取任務內容...");
      let assignments;
      try {
        assignments = await withTimeout(base44.entities.Assignment.filter({
          week_number: Number(weekNumber),
          task_number: Number(taskNumber)
        }));
        logPerf({ event: "task_assignment_load", page: "TaskPage", duration: Date.now() - t0, status: "success", participant_id: parsedParticipant?.participant_id, meta: { week: weekNumber, task: taskNumber } });
      } catch (err) {
        const isTimeout = err?.message === "__perf_timeout__";
        logPerf({ event: "task_assignment_load", page: "TaskPage", duration: Date.now() - t0, status: isTimeout ? "timeout" : "error", participant_id: parsedParticipant?.participant_id });
        setNotFound(true);
        return;
      }
      console.log(`[TaskPage] assignment request end — ${Date.now() - t0}ms`);

      if (assignments.length === 0) {
        setNotFound(true);
        return;
      }

      const assignmentData = assignments[0];

      // Preview mode: skip access check entirely
      if (isPreview) {
        setAssignment(assignmentData);
        setLoadingStatus("");
        return;
      }
      // Block access: priority 1) class-level, 2) Assignment.is_open, 3) default closed
      let isBlocked = true; // default: blocked unless explicitly opened
      if (parsedParticipant?.class_id) {
        try {
          const avList = await base44.entities.AssignmentAvailability.filter({
            assignment: assignmentData.id,
            class_id: parsedParticipant.class_id
          });
          if (avList.length > 0) {
            // Class-level record exists — use it
            isBlocked = !avList[0].is_open;
          } else {
            // No class-level record: fallback to Assignment.is_open
            isBlocked = assignmentData.is_open !== true;
          }
        } catch {
          isBlocked = assignmentData.is_open !== true;
        }
      } else {
        isBlocked = assignmentData.is_open !== true;
      }
      if (isBlocked) {
        setNotFound("not_open");
        return;
      }

      setAssignment(assignmentData);
      console.log("[TaskPage] assignment rendered", assignmentData.assignment_id);
      logPerf({ event: "task_first_render", page: "TaskPage", duration: Date.now() - _pageT0, status: "success", participant_id: parsedParticipant?.participant_id, meta: { assignment_id: assignmentData.assignment_id } });
      // Restore draft
      if (parsedParticipant) {
        const draft = loadDraftInline(parsedParticipant.participant_id, assignmentData.assignment_id);
        if (draft) setForm(f => ({ ...f, code_text: draft.code_text || "", notes: draft.notes || "" }));
      }
      // Setup auto-save
      saveDraftInline.current = (formData) => {
        if (!parsedParticipant) return;
        const k = `draft_${parsedParticipant.participant_id}_${assignmentData.assignment_id}`;
        try { localStorage.setItem(k, JSON.stringify({ code_text: formData.code_text, notes: formData.notes, savedAt: Date.now() })); } catch {}
      };

      // Phase 2: Background data (session + attempt + grading)
      console.log("[TaskPage] background data start");
      setLoadingStatus("正在讀取作答紀錄...");

      // Session (non-blocking, store when ready)
      base44.entities.Session.list().then(sessions => {
        if (!isMountedRef.current) return;
        if (sessions.length > 0) {
          const weekSession = sessions.find(s => s.session_id === `W${weekNumber}`);
          setSession(weekSession || sessions[0]);
        }
      }).catch(err => {
        console.error("[TaskPage] Session load error:", err);
      });

      if (!parsedParticipant) return;

      console.log("[TaskPage] attempt loaded start");
      const t1 = Date.now();
      let attempts = [];
      try {
        attempts = await withTimeout(base44.entities.Attempt.filter({
          participant: parsedParticipant.id,
          assignment: assignmentData.id
        }));
        logPerf({ event: "task_attempt_load", page: "TaskPage", duration: Date.now() - t1, status: "success", participant_id: parsedParticipant?.participant_id, meta: { count: attempts.length, assignment_id: assignmentData.assignment_id } });
      } catch (err) {
        const isTimeout = err?.message === "__perf_timeout__";
        logPerf({ event: "task_attempt_load", page: "TaskPage", duration: Date.now() - t1, status: isTimeout ? "timeout" : "error", participant_id: parsedParticipant?.participant_id });
      }
      console.log(`[TaskPage] attempt loaded — ${Date.now() - t1}ms, count: ${attempts.length}`);
      if (!isMountedRef.current) return;

      const completed = attempts
        .filter(a => a.end_ts || a.teacher_rating)
        .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))[0];
      if (completed) {
        setLoadingStatus("正在同步評分資料...");
        console.log("[TaskPage] grading loaded start");
        const t2 = Date.now();
        let freshAttempt, records = [];
        try {
          [freshAttempt, records] = await withTimeout(Promise.all([
            base44.entities.Attempt.get(completed.id),
            base44.entities.GradingRecord.filter({ attempt_id: completed.id })
          ]));
          logPerf({ event: "task_grading_load", page: "TaskPage", duration: Date.now() - t2, status: "success", participant_id: parsedParticipant?.participant_id, meta: { assignment_id: assignmentData.assignment_id } });
        } catch (err) {
          const isTimeout = err?.message === "__perf_timeout__";
          logPerf({ event: "task_grading_load", page: "TaskPage", duration: Date.now() - t2, status: isTimeout ? "timeout" : "error", participant_id: parsedParticipant?.participant_id });
        }
        console.log(`[TaskPage] grading loaded — ${Date.now() - t2}ms`);
        if (!isMountedRef.current) return;
        setExistingAttempt(freshAttempt);
        setRedoCount(freshAttempt.redo_count || 0);
        setPhase("submitted");
        setGradingRecords(records);
      }
      setLoadingStatus("");
    };
    loadData();
    return () => {
      isMountedRef.current = false;
    };
  }, [weekNumber, taskNumber]);

  useEffect(() => {
    if (!participant?.id || !assignment?.id) return;
    if (isPreview || urlPreviewFlag) return; // Preview mode: skip polling
    
    // 輪詢檢查並刷新評分資料
    const timer = setInterval(async () => {
      try {
        const attemptData = await base44.entities.Attempt.filter({
          participant: participant.id,
          assignment: assignment.id
        });
        const completed = attemptData
          .filter(a => a.end_ts || a.teacher_rating)
          .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))[0];
        if (completed) {
          const freshData = await base44.entities.Attempt.get(completed.id);
          setExistingAttempt(prev => {
            if (!prev?.teacher_rating && freshData.teacher_rating) {
              setRatingJustArrived(true);
              setTimeout(() => setRatingJustArrived(false), 1000);
            }
            return freshData;
          });
        }
      } catch {}
    }, 30000);
    
    return () => clearInterval(timer);
  }, [participant?.id, assignment?.id, isPreview, urlPreviewFlag]);

  useEffect(() => {
    if (phase === "task") {
      timerRef.current = setInterval(() => {
        setTotalSecs((t) => t + 1);
        setIntervalSecs((i) => {
          if (i + 1 >= intervalSecs_maxRef.current) {
            setRolePhase((r) => (r + 1) % 2);
            return 0;
          }
          return i + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleStart = async () => {
    if (!participant || !assignment) return;
    setLoading(true);
    try {
      if (isPreview) {
        // Preview mode: create a fake attempt in preview table
        const previewAttempt = await base44.entities.PreviewAttempt.create({
          preview_session_id: previewSessionId,
          source_participant_id: participant.participant_id,
          assignment_id: assignment.assignment_id,
          start_ts: new Date().toISOString(),
        });
        setAttempt({ ...previewAttempt, start_ts: previewAttempt.start_ts || new Date().toISOString() });
      } else {
        const attemptData = {
          participant: participant.id,
          assignment: assignment.id,
          start_ts: new Date().toISOString(),
          redo_count: redoCount
        };
        if (session?.id) {
          attemptData.session = session.id;
        }
        const a = await base44.entities.Attempt.create(attemptData);
        setAttempt(a);
      }
      setTotalSecs(0);
      setIntervalSecs(0);
      setRolePhase(0);
      setPhase("task");
    } catch (err) {
      console.error("[TaskPage] handleStart error:", err);
      showNotice("開始任務失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!attempt) return;
    const errors = {};
    if (form.submit_type.length === 0) {
      showNotice("請勾選提交方式");
      return;
    }
    if (form.submit_type.includes("paste") && !form.code_text.trim()) {
      errors.code_text = true;
    }
    if (form.submit_type.includes("upload") && !uploadedImageUrl) {
      errors.upload = true;
    }
    if (form.submit_type.includes("link") && !form.link_url.trim()) {
      errors.link_url = true;
    }
    if (Object.keys(errors).length > 0) {
      const msgs = [];
      if (errors.code_text) msgs.push("請輸入程式碼");
      if (errors.upload) msgs.push("請上傳截圖");
      if (errors.link_url) msgs.push("請輸入連結");
      showNotice(msgs.join("\n"));
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    const end = new Date();
    const start = new Date(attempt.start_ts);
    const mins = Math.round((end - start) / 60000);
    setDuration(mins);

    const combinedCode = [form.code_text, uploadedImageUrl].filter(Boolean).join("\n");
    const submitPayload = { end_ts: end.toISOString(), code_text: combinedCode, link_url: form.link_url || null, submit_type: form.submit_type.join(","), difficulty: Number(form.difficulty), notes: form.notes };
    try {
      if (isPreview) {
        // Preview mode: update preview attempt instead of real one
        await base44.entities.PreviewAttempt.update(attempt.id, submitPayload);
        console.log("[TaskPage][Preview] submit to preview table");
      } else {
        await withTimeout(base44.entities.Attempt.update(attempt.id, submitPayload));
        if (participant && assignment) clearDraftInline(participant.participant_id, assignment.assignment_id);
      }
    } catch {
      if (!isPreview && participant) {
        enqueueSync(participant.participant_id, { type: "attempt_update", attemptId: attempt.id, payload: submitPayload, assignment_id: assignment?.assignment_id });
        setLocalQueueCount(c => c + 1);
      }
    }
    setPhase("done");
    setLoading(false);
  };

  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if ((k === "code_text" || k === "notes") && saveDraftInline.current) saveDraftInline.current(next);
    return next;
  });

  const participantId = participant?.participant_id || "參與者";

  const roleInfo = rolePhase === 0 ?
    { navigator: participantId, driver: "AI" } :
    { navigator: "AI", driver: participantId };

  const exampleName = assignment?.example_title ?? "";
  const exampleContent = assignment?.example_code ?? "";
  const assignmentName = assignment?.title ?? "";
  const assignmentNo = assignment?.assignment_id ?? "";
  const assignment_Content = assignment?.prompt_text ?? "";
  const assignmentHint = assignment?.hint_text ?? "";

  const glassPage = { background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" };
  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.9) inset",
    borderRadius: 20,
  };

  if (!participant) {
    if (isPreview || urlPreviewFlag) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={glassPage}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.08)", borderTopColor: "#f97316" }}></div>
            <p className="text-sm" style={{ color: "#6e6e73" }}>載入預覽資料中...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center" style={glassPage}>
        <div className="text-center p-8" style={glassCard}>
          <p className="mb-3" style={{ color: "#6e6e73" }}>請先進行 Check-in</p>
          <a href={createPageUrl("CheckIn")} className="text-sm hover:underline" style={{ color: "#007aff" }}>前往 Check-in</a>
        </div>
      </div>
    );
  }

  if (notFound === "not_open") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={glassPage}>
        <div className="text-center p-10 max-w-sm mx-auto" style={glassCard}>
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "#1d1d1f" }}>此任務尚未開放</h2>
          <p className="text-sm mb-5" style={{ color: "#6e6e73" }}>此任務目前尚未對你的班級開放，請等待老師開放後再進入。</p>
          <a href={createPageUrl("WeekSelection")} className="inline-block px-5 py-2 rounded-xl text-sm font-medium transition" style={{ background: "#007aff", color: "#fff" }}>返回任務選單</a>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={glassPage}>
        <div className="text-center p-8" style={glassCard}>
          <p className="mb-3" style={{ color: "#6e6e73" }}>找不到此任務</p>
          <a href={createPageUrl("WeekSelection")} className="text-sm hover:underline" style={{ color: "#007aff" }}>返回任務選單</a>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={glassPage}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.08)", borderTopColor: "#007aff" }}></div>
          {loadingStatus && <p className="text-sm" style={{ color: "#6e6e73" }}>{loadingStatus}</p>}
        </div>
      </div>
    );
  }

  const hasDraftBanner = !!(assignment && participant && loadDraftInline(participant?.participant_id, assignment?.assignment_id));

  return (
  <div className="min-h-screen" style={glassPage}>
    {isPreview && <PreviewBanner />}
    {showPromptManager && (
      <UserPromptManager
        participantId={participant?.participant_id}
        onClose={() => setShowPromptManager(false)}
      />
    )}
    {isDegradedMode && !isPreview && <DegradedBanner queueCount={localQueueCount} />}
    {hasDraftBanner && phase === "pre" && (
      <div className="w-full px-4 py-2 text-sm" style={{ background: "rgba(0,122,255,0.08)", borderBottom: "1px solid rgba(0,122,255,0.18)", color: "#0055cc" }}>
        📝 發現本機草稿 — 已自動還原先前作答內容
      </div>
    )}
    <div className={`p-4 ${(phase === "task" || (phase === "submitted" && existingAttempt)) ? "pb-24 lg:pb-4" : ""}`}>
    {notice && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300"
        style={{ background: "rgba(0,0,0,0.15)" }}
        onClick={() => setNotice("")}
      >
        <div
          className="flex flex-col items-center gap-4 px-10 py-8 rounded-3xl animate-in zoom-in-90 duration-300"
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(220,38,38,0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-3xl">⚠️</div>
          <p className="text-center whitespace-pre-line text-base font-semibold text-red-600">{notice}</p>
          <button
            onClick={() => setNotice("")}
            className="px-6 py-2 rounded-2xl text-sm font-semibold text-red-600 transition"
            style={{
              background: "rgba(255,59,48,0.1)",
              border: "1px solid rgba(255,59,48,0.25)",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,59,48,0.18)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,59,48,0.1)"}
          >關閉</button>
        </div>
      </div>
    )}
      <div className={`mx-auto flex flex-col lg:flex-row gap-4 ${phase === "task" || phase === "submitted" ? "max-w-7xl" : "max-w-2xl"} ${(phase === "task" || (phase === "submitted" && existingAttempt)) ? "pb-24 lg:pb-0" : ""}`}>
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="p-5 mb-4" style={glassCard}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>
                  第 {assignment.week_number} 週 - 任務 {assignment.task_number}
                </h1>
                <p className="text-sm" style={{ color: "#6e6e73" }}>
                  參與者：<span className="font-medium" style={{ color: "#3a3a3c" }}>{participant.participant_id}</span>
                </p>
              </div>
              <a
                href={isPreview && participant?.participant_id ? `/WeekSelection/preview/${participant.participant_id}` : createPageUrl("WeekSelection")}
                className="text-xs hover:underline" style={{ color: "#aeaeb2" }}
              >← 任務選單</a>
            </div>
          </div>

          {/* Example Section */}
          {assignment && assignment.example_code &&
            <div ref={exampleBlockRef} className="p-5 mb-4" style={glassCard}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>課堂範例</h2>
                <button
                  onClick={() => setExampleCollapsed(c => !c)}
                  className="text-xs px-2 py-0.5 rounded-lg transition"
                  style={{ color: "#6e6e73", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}
                >
                  {exampleCollapsed ? "展開 ▼" : "縮小 ▲"}
                </button>
              </div>
              {!exampleCollapsed && (
              <div className="flex flex-col gap-4">
                <div>
                  {exampleName && (
                    <div className="flex items-baseline gap-3 mb-2">
                      <h3 className="text-base font-semibold" style={{ color: "#1d1d1f" }}>{exampleName}</h3>
                      {assignment.example_subtitle && (
                        <span className="text-sm" style={{ color: "#6e6e73" }}>{assignment.example_subtitle}</span>
                      )}
                    </div>
                  )}
                  <EditableCodeBlock
                    initialCode={exampleContent}
                    assignmentId={assignment?.assignment_id || ""}
                    participantDbId={participant?.id}
                  />
                </div>
                {(() => {
                  const rawExImgs = [
                    { url: assignment.example_image_url, label: assignment.example_image_label },
                    { url: assignment.example_image_url2, label: assignment.example_image_label2 },
                    { url: assignment.example_image_url3, label: assignment.example_image_label3 },
                    { url: assignment.example_image_url4, label: assignment.example_image_label4 },
                    { url: assignment.example_image_url5, label: assignment.example_image_label5 },
                  ].filter(item => item.url);
                  if (rawExImgs.length === 0) return null;
                  const toggleKey = `ex_imgs`;
                  return (
                    <div className="mt-2">
                      {floatingImageUrl === toggleKey && (
                        <div className="mb-2 flex gap-2 flex-wrap">
                          {rawExImgs.map((item, i) => (
                            <div
                              key={i}
                              className="flex flex-col items-center gap-1 cursor-zoom-in"
                              style={{ flex: `1 1 calc(${100 / rawExImgs.length}% - 0.5rem)`, minWidth: "120px" }}
                              onClick={() => openLightbox(item.url, "example")}
                            >
                              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:opacity-90 transition w-full">
                                <img src={item.url} alt={item.label || `範例圖片 ${i + 1}`} className="block w-full object-contain" />
                              </div>
                              <span className="text-xs text-gray-500 font-medium">{item.label || `圖${i + 1}`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setFloatingImageUrl(floatingImageUrl === toggleKey ? null : toggleKey)}
                          className="text-xs px-2 py-0.5 rounded-lg transition"
                          style={{ color: "#6e6e73", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}
                        >
                          {floatingImageUrl === toggleKey ? "收起圖片 ▲" : `展開圖片（${rawExImgs.length} 張）▼`}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
              )}
            </div>
          }

          {/* Assignment Prompt */}
          {assignment &&
            <div className="p-5 mb-4" style={glassCard}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>課堂作業 {assignmentNo}</h2>
                  {assignment.difficulty_label && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,149,0,0.12)", color: "#b45309" }}>
                      {assignment.difficulty_label}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={assignment.allow_ai ? { background: "rgba(52,199,89,0.12)", color: "#1a7f37" } : { background: "rgba(255,59,48,0.10)", color: "#cc3228" }}>
                    {assignment.allow_ai ? "✓ 可用AI" : "✗ 不可用AI"}
                  </span>
                </div>
                <button
                  onClick={() => setAssignmentCollapsed(c => !c)}
                  className="text-xs px-2 py-0.5 rounded-lg transition"
                  style={{ color: "#6e6e73", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}
                >
                  {assignmentCollapsed ? "展開 ▼" : "縮小 ▲"}
                </button>
              </div>
              {!assignmentCollapsed && (
              <>
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "#1d1d1f" }}>{assignmentName}</h3>
                  <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.07)", color: "#3a3a3c" }}>
                    <LatexRenderer>{assignment_Content}</LatexRenderer>
                  </div>
                  {assignmentHint && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>提示</p>
                      <p className="text-sm" style={{ color: "#6e6e73" }}>{assignmentHint}</p>
                    </div>
                  )}
                </div>
                {(() => {
                  const rawAsgImgs = [
                    { url: assignment.assignment_image_url, label: assignment.assignment_image_label },
                    { url: assignment.assignment_image_url2, label: assignment.assignment_image_label2 },
                    { url: assignment.assignment_image_url3, label: assignment.assignment_image_label3 },
                    { url: assignment.assignment_image_url4, label: assignment.assignment_image_label4 },
                    { url: assignment.assignment_image_url5, label: assignment.assignment_image_label5 },
                  ].filter(item => item.url);
                  if (rawAsgImgs.length === 0) return null;
                  const toggleKey = `asg_imgs`;
                  return (
                    <div className="mt-2">
                      {floatingImageUrl === toggleKey && (
                        <div className="mb-2 flex gap-2 flex-wrap">
                          {rawAsgImgs.map((item, i) => (
                            <div
                              key={i}
                              className="flex flex-col items-center gap-1 cursor-zoom-in"
                              style={{ flex: `1 1 calc(${100 / rawAsgImgs.length}% - 0.5rem)`, minWidth: "120px" }}
                              onClick={() => openLightbox(item.url, "assignment")}
                            >
                              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:opacity-90 transition w-full">
                                <img src={item.url} alt={item.label || `作業圖片 ${i + 1}`} className="block w-full object-contain" />
                              </div>
                              <span className="text-xs text-gray-500 font-medium">{item.label || `圖${i + 1}`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setFloatingImageUrl(floatingImageUrl === toggleKey ? null : toggleKey)}
                          className="text-xs px-2 py-0.5 rounded-lg transition"
                          style={{ color: "#6e6e73", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}
                        >
                          {floatingImageUrl === toggleKey ? "收起圖片 ▲" : `展開圖片（${rawAsgImgs.length} 張）▼`}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              </>
              )}
            </div>
          }

          {/* Phase: submitted */}
          {phase === "submitted" && existingAttempt &&
            <div className="p-6" style={{ ...glassCard, border: "1px solid rgba(0,122,255,0.25)" }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl">📋</div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: "#1d1d1f" }}>你已提交此任務</h2>
                  <p className="text-sm" style={{ color: "#6e6e73" }}>
                    提交時間：{new Date(existingAttempt.end_ts).toLocaleString('zh-TW')}
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.07)" }}>
                <div>
                   <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>你的程式碼</p>
                   <div style={{ maxHeight: "320px", overflow: "auto" }}>
                     <CodePreview 
                       code={(existingAttempt.code_text || "").split("\n").filter(line => !/^https?:\/\//.test(line.trim())).join("\n").trim() || "（未提供程式碼）"}
                     />
                   </div>
                  {gradingRecords.length > 0 && (() => {
                    const latestGrading = [...gradingRecords].sort((a, b) => b.version - a.version)[0];
                    return latestGrading?.annotation ? (
                      <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.2)" }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: "#cc3228" }}>📔 程式碼批註 (v{latestGrading.version})</p>
                        <pre className="text-xs whitespace-pre-wrap font-mono p-2 rounded-lg" style={{ color: "#cc3228", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,59,48,0.12)" }}>{latestGrading.annotation}</pre>
                      </div>
                    ) : null;
                  })()}
                  {existingAttempt.submit_type && existingAttempt.submit_type.includes("upload") && existingAttempt.code_text && (() => {
                    const imageUrl = existingAttempt.code_text.split("\n").find(line => /^https?:\/\//.test(line.trim()));
                    const latestGrading = [...gradingRecords].sort((a, b) => b.version - a.version)[0];
                    return imageUrl ? (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-500 mb-1">{latestGrading?.canvas_image_url ? "截圖批改標註" : "上傳截圖"}</p>
                        {latestGrading?.canvas_image_url ? (
                          <div className="relative inline-block w-full">
                            <img src={imageUrl} alt="原始截圖" className="w-full rounded-lg border border-gray-200 object-contain" />
                            <img src={latestGrading.canvas_image_url} alt="批改標註" className="absolute inset-0 w-full h-full rounded-lg object-contain pointer-events-none" />
                          </div>
                        ) : (
                          <img
                            src={imageUrl}
                            alt="上傳截圖"
                            onClick={() => setLightboxUrl(imageUrl)}
                            className="max-h-64 rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition"
                          />
                        )}
                      </div>
                    ) : null;
                  })()}
                  {existingAttempt.link_url && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>連結</p>
                      <a href={existingAttempt.link_url} target="_blank" rel="noopener noreferrer" className="text-sm break-all hover:underline" style={{ color: "#007aff" }}>{existingAttempt.link_url}</a>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>提交方式</p>
                    <p className="text-sm" style={{ color: "#3a3a3c" }}>
                      {existingAttempt.submit_type
                        ? existingAttempt.submit_type.split(",").map(v => SUBMIT_TYPE_LABELS[v.trim()] ?? v.trim()).join("、")
                        : "未記錄"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>完成時間</p>
                    <p className="text-sm" style={{ color: "#3a3a3c" }}>
                      {Math.max(1, Math.round((new Date(existingAttempt.end_ts) - new Date(existingAttempt.start_ts)) / 60000))} 分鐘
                    </p>
                  </div>
                </div>

                {existingAttempt.notes && (
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>備註</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "#3a3a3c" }}>{existingAttempt.notes}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-3 justify-center">
                <a
                  href={isPreview && participant?.participant_id ? `/WeekSelection/preview/${participant.participant_id}` : createPageUrl("WeekSelection")}
                  className="inline-block px-6 py-2.5 rounded-xl text-sm font-medium transition"
                  style={{ background: "rgba(0,0,0,0.08)", color: "#3a3a3c" }}
                >
                  返回任務選單
                </a>
                {(() => {
                  const isLocked = !!existingAttempt?.teacher_rating && !existingAttempt?.allow_redo_override;
                  return (
                    <button
                      onClick={() => {
                        const next = redoCount + 1;
                        setRedoCount(next);
                        setExistingAttempt(null);
                        setAttempt(null);
                        setForm({ code_text: "", submit_type: [], link_url: "", difficulty: 4, notes: "" });
                        setPhase("pre");
                      }}
                      disabled={isLocked}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium transition"
                      style={isLocked ? { background: "rgba(0,0,0,0.06)", color: "#aeaeb2", cursor: "not-allowed" } : { background: "#f97316", color: "#fff" }}
                      title={isLocked ? "已評分，無法重做（需管理者解鎖）" : ""}
                    >
                      {existingAttempt?.allow_redo_override ? "↻ 重做（已解鎖）" : `重做此任務 ${redoCount > 0 ? `（第 ${redoCount + 1} 次）` : ""}`}
                    </button>
                  );
                })()}
              </div>
            </div>
          }


          {/* Lightbox */}
          {lightboxUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
              onClick={() => setLightboxUrl(null)}
            >
              {/* Prev button */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + lightboxImages.length) % lightboxImages.length); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white text-xl flex items-center justify-center transition z-10"
                >‹</button>
              )}

              {(() => {
                // Resolve label for current lightbox image
                const allLabeledImgs = assignment ? [
                  { url: assignment.example_image_url, label: assignment.example_image_label },
                  { url: assignment.example_image_url2, label: assignment.example_image_label2 },
                  { url: assignment.example_image_url3, label: assignment.example_image_label3 },
                  { url: assignment.example_image_url4, label: assignment.example_image_label4 },
                  { url: assignment.example_image_url5, label: assignment.example_image_label5 },
                  { url: assignment.assignment_image_url, label: assignment.assignment_image_label },
                  { url: assignment.assignment_image_url2, label: assignment.assignment_image_label2 },
                  { url: assignment.assignment_image_url3, label: assignment.assignment_image_label3 },
                  { url: assignment.assignment_image_url4, label: assignment.assignment_image_label4 },
                  { url: assignment.assignment_image_url5, label: assignment.assignment_image_label5 },
                ].filter(i => i.url) : [];
                const currentLabel = allLabeledImgs.find(i => i.url === lightboxUrl)?.label;
                // (label lookup already covers both groups — no change needed)
                return (
                  <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
                    <img src={lightboxUrl} alt="放大檢視" className="max-w-[85vw] max-h-[80vh] rounded-xl shadow-2xl object-contain" />
                    {currentLabel && (
                      <span className="text-white/90 text-sm font-medium bg-black/30 px-3 py-1 rounded-full">{currentLabel}</span>
                    )}
                    {lightboxImages.length > 1 && (
                      <div className="flex gap-1.5">
                        {lightboxImages.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setLightboxIndex(i)}
                            className={`w-2 h-2 rounded-full transition ${i === lightboxIndex ? "bg-white" : "bg-white/40 hover:bg-white/70"}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Next button */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % lightboxImages.length); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white text-xl flex items-center justify-center transition z-10"
                >›</button>
              )}

              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute top-4 right-4 text-white text-3xl font-bold leading-none hover:opacity-70 z-10"
              >✕</button>
            </div>
          )}

          {/* Phase: pre */}
          {phase === "pre" &&
            <div className="text-center py-4 mb-24 lg:mb-0">
              {isPreview && (
                <p className="text-xs inline-block rounded-xl px-3 py-1.5 mb-3" style={{ background: "rgba(255,149,0,0.10)", color: "#b45309", border: "1px solid rgba(255,149,0,0.25)" }}>
                  ⚠️ 預覽模式 — 此操作不影響正式資料
                </p>
              )}
              <button
                onClick={handleStart}
                disabled={loading || !assignment}
                className="px-8 py-3 rounded-2xl font-semibold text-sm disabled:opacity-50 transition"
                style={{ background: isPreview ? "#f97316" : "#007aff", color: "#fff", boxShadow: "0 4px 16px rgba(0,122,255,0.25)" }}
              >
                {loading ? "啟動中…" : isPreview ? "▶ 模擬開始任務（預覽）" : "▶ 開始任務"}
              </button>
              <p className="text-xs mt-2" style={{ color: "#aeaeb2" }}>點擊後計時器將開始</p>
            </div>
          }

          {/* Phase: task - Compiler block with tab switcher */}
          {phase === "task" &&
            <div className="p-4 mb-4" style={glassCard}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                <h2 className="text-base font-semibold" style={{ color: "#1d1d1f" }}>Ｃ程式測試區</h2>
                <div className="flex rounded-xl overflow-hidden text-xs font-medium" style={{ border: "1px solid rgba(0,0,0,0.10)", background: "rgba(0,0,0,0.04)" }}>
                  {[{key:"simulator",label:"C 模擬器"},{key:"online",label:"OneCompiler"},{key:"onlineide",label:"OnlineIDE Pro"}].map((tab, i) => (
                    <button
                      key={tab.key}
                      onClick={() => setCompilerTab(tab.key)}
                      className="px-3 py-2 whitespace-nowrap transition text-center"
                      style={{
                        background: compilerTab === tab.key ? "#007aff" : "transparent",
                        color: compilerTab === tab.key ? "#fff" : "#6e6e73",
                        borderLeft: i > 0 ? "1px solid rgba(0,0,0,0.08)" : "none",
                      }}
                    >{tab.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: compilerTab === "simulator" ? "block" : "none" }}>
                <p className="text-xs mb-3" style={{ color: "#aeaeb2" }}>在下方編寫並執行你的 C 程式，完成後將程式碼貼到下面的作答區。</p>
                <CCompiler initialCode={assignment?.example_code || ""} />
              </div>
              <div style={{ display: compilerTab === "online" ? "block" : "none" }}>
                <div style={{ overflow: "hidden", height: "520px", minHeight: "520px", maxHeight: "520px", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative", flexShrink: 0 }}>
                  <iframe
                    src="https://onecompiler.com/embed/c?theme=dark&hideNew=true&hideTitle=true"
                    title="OneCompiler 線上 C 編譯器"
                    scrolling="no"
                    style={{ width: "100%", height: "520px", border: "none", display: "block", flexShrink: 0 }}
                    allow="clipboard-write"
                  />
                </div>
              </div>
              <div style={{ display: compilerTab === "onlineide" ? "block" : "none" }}>
                <div style={{ overflow: "hidden", height: "520px", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative" }}>
                  <iframe
                    src="https://www.onlineide.pro/playground/c"
                    title="OnlineIDE Pro C 編譯器"
                    style={{ width: "100%", height: "520px", border: "none", display: "block" }}
                    allow="clipboard-write"
                  />
                  {/* Cover the floating AI button in the bottom-right corner of the iframe */}
                  <div style={{ position: "absolute", bottom: 0, right: 0, width: "100px", height: "100px", background: "white", pointerEvents: "all", cursor: "default" }} />
                </div>
              </div>
            </div>
          }

          {phase === "task" &&
            <div className="p-5" style={glassCard}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold" style={{ color: "#1d1d1f" }}>提交作業</h2>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "rgba(52,199,89,0.12)", color: "#1a7f37" }}>● 計時中</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium" style={{ color: "#3a3a3c" }}>你的程式碼</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={codeTheme}
                        onChange={(e) => setCodeTheme(e.target.value)}
                        className="px-2 py-1 text-xs rounded-lg focus:outline-none"
                        style={{ border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.8)", color: "#3a3a3c" }}
                      >
                        <option value="light">淺色主題</option>
                        <option value="dark">深色主題</option>
                      </select>
                      <LanguageSelector value={codeLanguage} onChange={setCodeLanguage} className="text-xs" />
                    </div>
                  </div>
                  <div className={`relative border rounded-lg focus-within:ring-2 overflow-hidden ${fieldErrors.code_text ? "border-red-500 focus-within:ring-red-400" : "border-gray-300 focus-within:ring-blue-500"}`} style={{ background: codeTheme === 'dark' ? '#1e1e1e' : '#ffffff' }}>
                    <div className="flex flex-1 overflow-hidden font-mono text-sm rounded-lg relative" style={{ minHeight: `${Math.max(5, form.code_text.split('\n').length) * 1.5}rem` }}>
                      {/* Line numbers */}
                      <div className="select-none text-right px-2 py-3 overflow-hidden flex-shrink-0" style={{ minWidth: "2.8rem", lineHeight: "1.5rem", background: codeTheme === 'dark' ? '#252525' : '#f3f4f6', color: codeTheme === 'dark' ? '#858585' : '#9ca3af', borderRight: `1px solid ${codeTheme === 'dark' ? '#3c3c3c' : '#e5e7eb'}` }}>
                        {Array.from({ length: Math.max(5, form.code_text.split('\n').length) }, (_, i) => (
                          <div key={i} style={{ lineHeight: "1.5rem" }}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Highlighted overlay */}
                      <div className="absolute left-10 top-0 bottom-0 right-0 overflow-hidden pointer-events-none">
                        <pre className="text-sm pt-3 px-3 m-0 overflow-hidden" style={{ color: codeTheme === 'dark' ? '#d4d4d4' : '#1e1e1e', lineHeight: "1.5rem", whiteSpace: "pre" }}>
                          {getHighlightedLines(form.code_text, codeLanguage).map((html, i) => (
                            <div key={i} dangerouslySetInnerHTML={{ __html: html || " " }} style={{ lineHeight: "1.5rem" }} />
                          ))}
                          {Array.from({ length: Math.max(0, 5 - form.code_text.split('\n').length) }, (_, i) => (
                            <div key={`empty-${i}`} style={{ lineHeight: "1.5rem" }}> </div>
                          ))}
                        </pre>
                      </div>
                      {/* Textarea */}
                      <textarea
                        value={form.code_text}
                        onChange={(e) => { set("code_text", e.target.value); setFieldErrors(f => ({ ...f, code_text: false })); }}
                        placeholder="將你的程式碼貼到這裡…"
                        spellCheck={false}
                        className="flex-1 resize-none outline-none px-3 py-3 whitespace-pre overflow-x-auto relative z-10"
                        style={{ 
                          lineHeight: "1.5rem",
                          minHeight: `${Math.max(5, form.code_text.split('\n').length) * 1.5}rem`,
                          background: "transparent",
                          color: "transparent",
                          caretColor: codeTheme === 'dark' ? '#d4d4d4' : '#000000',
                          fontFamily: "'Courier New', Consolas, monospace"
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#3a3a3c" }}>提交方式（可複選）</label>
                  <div className="flex gap-4">
                    {[{value: "paste", label: "貼上程式碼"}, {value: "upload", label: "上傳截圖"}, {value: "link", label: "連結"}].map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: "#3a3a3c" }}>
                        <input
                          type="checkbox"
                          checked={form.submit_type.includes(opt.value)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.submit_type, opt.value]
                              : form.submit_type.filter(v => v !== opt.value);
                            set("submit_type", next);
                          }}
                          className="w-4 h-4 accent-blue-600"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {form.submit_type.includes("upload") && (
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>上傳截圖</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) { setUploadFile(null); return; }
                          const valid = /\.(jpg|jpeg|png)$/i.test(file.name);
                          setUploadFile(valid ? file : null);
                          if (!valid) e.target.value = "";
                        }}
                        className={`flex-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium ${fieldErrors.upload ? "file:bg-red-100 file:text-red-700 hover:file:bg-red-200" : "file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"}`}
                      />
                      <button
                        type="button"
                        disabled={!uploadFile || uploadLoading}
                        onClick={async () => {
                          if (!uploadFile) return;
                          setUploadLoading(true);
                          const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadFile });
                          setUploadedImageUrl(file_url);
                          setFieldErrors(f => ({ ...f, upload: false }));
                          setUploadLoading(false);
                        }}
                        className="px-3 py-1.5 text-sm rounded-xl font-medium transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        style={fieldErrors.upload ? { background: "#ff3b30", color: "#fff" } : { background: "#007aff", color: "#fff" }}
                      >
                        {uploadLoading ? "上傳中…" : "確認上傳"}
                      </button>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#aeaeb2" }}>僅支援 .jpg / .jpeg / .png 格式</p>
                    {uploadedImageUrl && (
                      <div className="mt-3">
                        <img src={uploadedImageUrl} alt="上傳截圖" className="max-h-64 rounded-lg border border-gray-200 object-contain" />
                        <button
                          type="button"
                          onClick={() => { setUploadedImageUrl(""); setUploadFile(null); }}
                          className="mt-2 w-full py-1.5 text-xs rounded-xl font-medium transition"
                          style={{ color: "#cc3228", border: "1px solid rgba(255,59,48,0.25)", background: "rgba(255,59,48,0.06)" }}
                        >
                          🗑 刪除圖片
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {form.submit_type.includes("link") && (
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>輸入連結</label>
                    <input
                      type="url"
                      value={form.link_url}
                      onChange={(e) => { set("link_url", e.target.value); setFieldErrors(f => ({ ...f, link_url: false })); }}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                      style={fieldErrors.link_url ? { border: "1px solid #ff3b30", background: "rgba(255,59,48,0.06)" } : { border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.7)" }}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>備註（選填）</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={3}
                    placeholder="記錄你的解題想法…"
                    className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                    style={{ border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.7)" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-2xl text-sm font-semibold disabled:opacity-50 transition"
                  style={{ background: isPreview ? "#f97316" : "#34c759", color: "#fff", boxShadow: "0 2px 12px rgba(52,199,89,0.25)" }}
                >
                  {loading ? "提交中…" : isPreview ? "✓ 預覽提交（不寫入正式資料）" : "✓ 提交作業"}
                </button>
              </form>
            </div>
          }

          {/* Phase: done */}
          {phase === "done" &&
            <div className="p-6" style={{ ...glassCard, border: isPreview ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(52,199,89,0.3)" }}>
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">{isPreview ? "👁️" : "✅"}</div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: "#1d1d1f" }}>{isPreview ? "預覽提交完成" : "已收到你的提交"}</h2>
                {isPreview && <p className="text-sm mb-2" style={{ color: "#b45309" }}>此為預覽模式，未寫入正式資料</p>}
                <p className="text-sm" style={{ color: "#6e6e73" }}>
                  完成時間：<span className="font-semibold" style={{ color: "#1d1d1f" }}>{duration} 分鐘</span>
                </p>
              </div>

              {/* Submitted content */}
              <div className="rounded-xl p-4 space-y-4 mb-6" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.07)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>已提交內容</p>

                {form.submit_type.includes("paste") && (
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>程式碼</p>
                    <div style={{ maxHeight: "320px", overflow: "auto" }}>
                      <CodePreview code={form.code_text || "（未輸入）"} />
                    </div>
                  </div>
                )}

                {form.submit_type.includes("upload") && uploadedImageUrl && (
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#8e8e93" }}>上傳截圖</p>
                    <img
                      src={uploadedImageUrl}
                      alt="上傳截圖"
                      className="max-h-64 rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition"
                      onClick={() => setLightboxUrl(uploadedImageUrl)}
                    />
                  </div>
                )}

                {form.submit_type.includes("link") && form.link_url && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">連結</p>
                    <a href={form.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all hover:text-blue-800">{form.link_url}</a>
                  </div>
                )}

                {form.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">備註</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{form.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">提交方式</p>
                  <p className="text-sm text-gray-700">
                    {form.submit_type.map(v => SUBMIT_TYPE_LABELS[v] ?? v).join("、")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <a
                  href={isPreview && participant?.participant_id ? `/WeekSelection/preview/${participant.participant_id}` : createPageUrl("WeekSelection")}
                  className="inline-block px-6 py-2.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition"
                >
                  返回任務選單
                </a>
                {assignment && participant && (
                  <a
                    href={`/TaskPage?week=${assignment.week_number}&task=${Number(assignment.task_number) + 1}&pid=${participant.id}${isPreview ? "&preview=1" : ""}`}
                    className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                  >
                    下一個任務 →
                  </a>
                )}
              </div>
            </div>
          }
        </div>

        {/* Right Sidebar - Tablet Landscape & Desktop */}
        {(phase === "task" || (phase === "submitted" && existingAttempt)) && (
          <div
            className="flex-shrink-0 transition-all duration-300 ease-in-out hidden md:block"
            style={{ width: sidebarExpanded ? '800px' : '420px' }}
          >
            {phase === "task" && existingAttempt?.teacher_rating ? (
              <div className="p-5 sticky top-4 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto" style={glassCard}>
                <div className="rounded-xl p-4 text-center transition-all duration-700" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.25)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#8e8e93" }}>任務等第</p>
                  <p className="text-5xl font-bold" style={{ color: "#1a7f37" }}>{existingAttempt.teacher_rating}</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.2)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#007aff" }}>💬 教師評語</p>
                  <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0" style={{ color: "#1d1d1f" }}>
                    <ReactMarkdown>{existingAttempt?.teacher_feedback || "（無評語）"}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : phase === "task" ? (
              <div className="p-5 sticky top-4 flex flex-col overflow-hidden" style={{ ...glassCard, maxHeight: 'calc(100vh - 2rem)' }}>
              <>
              <div className="relative mb-4">
                <button
                  onClick={() => setSidebarExpanded(e => !e)}
                  className="absolute -top-1 -right-1 p-1.5 rounded-xl transition z-10"
                  style={{ border: "1px solid rgba(0,0,0,0.10)", color: "#8e8e93", background: "rgba(255,255,255,0.7)" }}
                >
                  {sidebarExpanded ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" /></svg>
                  )}
                </button>
                <div className="flex justify-center gap-6">
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#8e8e93" }}>總時間</p>
                    <p className="text-3xl font-mono font-bold" style={{ color: "#1d1d1f" }}>{formatTime(totalSecs)}</p>
                  </div>
                  {participant?.group !== "AI_Solo" && (
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#8e8e93" }}>角色更換倒數</p>
                      <p className="text-3xl font-mono font-bold" style={{ color: "#007aff" }}>{formatTime(intervalSecs_max - intervalSecs)}</p>
                    </div>
                  )}
                </div>
              </div>
              {participant?.group !== "AI_Solo" && (
                <div className="mb-4 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${intervalSecs / intervalSecs_max * 100}%`, background: "#007aff" }} />
                </div>
              )}
              {participant?.group !== "AI_Solo" &&
                <div key={rolePhase} className="flex gap-3 mb-5 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#6366f1" }}>導航員</p>
                    <p className="text-base font-bold" style={{ color: "#4338ca" }}>{roleInfo.navigator}</p>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#d97706" }}>駕駛員</p>
                    <p className="text-base font-bold" style={{ color: "#92400e" }}>{roleInfo.driver}</p>
                  </div>
                </div>
              }
              <div className="pt-4 flex flex-col flex-1 min-h-0" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>Gemini</p>
                  <button
                    onClick={() => setShowPromptManager(true)}
                    className="text-xs px-2.5 py-1 rounded-xl transition"
                    style={{ border: "1px solid rgba(0,0,0,0.10)", color: "#6e6e73", background: "rgba(255,255,255,0.6)" }}
                  >
                    管理提示詞
                  </button>
                </div>
                {isMdOrAbove && (
                  <GeminiInput
                    rolePhase={participant?.group === "AI_Solo" ? null : rolePhase}
                    participantId={participantId}
                    participantDbId={participant?.id}
                    attemptId={attempt?.id}
                    codeText={form.code_text}
                    promptText={assignment?.prompt_text || ""}
                    assignmentId={assignment?.assignment_id || ""}
                    isSolo={participant?.group === "AI_Solo"}
                    referenceAnswer={assignment?.answer || ""}
                  />
                )}
              </div>
              </>
            </div>
            ) : (
              <div className="p-5 sticky top-4 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto" style={glassCard}>
                {existingAttempt?.teacher_rating ? (
                  <>
                    <div className="rounded-xl p-4 text-center" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.25)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "#8e8e93" }}>任務等第</p>
                      <p className="text-5xl font-bold" style={{ color: "#1a7f37" }}>{existingAttempt.teacher_rating}</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.2)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "#007aff" }}>💬 教師評語</p>
                      <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0" style={{ color: "#1d1d1f" }}>
                        <ReactMarkdown>{existingAttempt?.teacher_feedback || "（無評語）"}</ReactMarkdown>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl p-4 text-center" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)" }}>
                    <p className="text-xs" style={{ color: "#8e8e93" }}>教師評語與等第待評分</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobile Floating Button - Portrait only */}
        {(phase === "task" || (phase === "submitted" && existingAttempt)) && (
          <>
            <button
              onClick={() => setMobileFloatingOpen(true)}
              className="fixed bottom-4 right-4 md:bottom-6 md:right-6 md:hidden z-20 w-12 h-12 rounded-full text-white shadow-lg transition flex items-center justify-center relative text-sm"
              style={{
                background: "conic-gradient(from 0deg, #93c5fd, #c4b5fd, #f9a8d4, #fcd34d, #67e8f9, #93c5fd)",
                animation: "spin-gradient 4s linear infinite"
              }}
              title="AI 助手"
            >
              <span className="relative z-10">💬</span>
            </button>

            {/* Mobile Floating Panel */}
            <AnimatePresence>
              {mobileFloatingOpen && (
                <motion.div
                  className="fixed inset-0 md:hidden z-50 flex flex-col"
                  style={{ background: "rgba(242,242,247,0.97)", backdropFilter: "blur(20px)" }}
                  initial={{ opacity: 0, y: '100%' }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: '100%' }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                <div className="relative px-4 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)" }}>
                  <h2 className="font-semibold text-sm" style={{ color: "#1d1d1f" }}>Gemini 助手</h2>
                  <button
                    onClick={() => setMobileFloatingOpen(false)}
                    className="absolute top-2 right-2 text-xl leading-none p-2"
                    style={{ color: "#8e8e93" }}
                  >
                    ✕
                  </button>
                </div>
                <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)" }}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#8e8e93" }}>總時間</p>
                        <p className="text-sm font-mono font-bold" style={{ color: "#1d1d1f" }}>{formatTime(totalSecs)}</p>
                      </div>
                      {participant?.group !== "AI_Solo" && (
                        <div className="text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#8e8e93" }}>角色倒數</p>
                          <p className="text-sm font-mono font-bold" style={{ color: "#007aff" }}>{formatTime(intervalSecs_max - intervalSecs)}</p>
                        </div>
                      )}
                    </div>
                    {participant?.group !== "AI_Solo" && (
                      <div className="flex gap-2 flex-1">
                        <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#6366f1" }}>導航員</p>
                          <p className="text-xs font-bold" style={{ color: "#4338ca" }}>{roleInfo.navigator}</p>
                        </div>
                        <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#d97706" }}>駾駛員</p>
                          <p className="text-xs font-bold" style={{ color: "#92400e" }}>{roleInfo.driver}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {phase === "task" ? (
                    !isMdOrAbove && (
                      <GeminiInput
                        rolePhase={participant?.group === "AI_Solo" ? null : rolePhase}
                        participantId={participantId}
                        participantDbId={participant?.id}
                        attemptId={attempt?.id}
                        codeText={form.code_text}
                        promptText={assignment?.prompt_text || ""}
                        assignmentId={assignment?.assignment_id || ""}
                        isSolo={participant?.group === "AI_Solo"}
                        referenceAnswer={assignment?.answer || ""}
                      />
                    )
                  ) : existingAttempt?.teacher_rating ? (
                    <div className="p-4 space-y-4">
                      <div className="rounded-xl p-4 text-center" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.25)" }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: "#8e8e93" }}>任務等第</p>
                        <p className="text-3xl font-bold" style={{ color: "#1a7f37" }}>{existingAttempt.teacher_rating}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.2)" }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: "#007aff" }}>💬 教師評語</p>
                        <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0" style={{ color: "#1d1d1f" }}>
                          <ReactMarkdown>{existingAttempt?.teacher_feedback || "（無評語）"}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center" style={{ color: "#8e8e93" }}>
                      <p>教師評語與等第待評分</p>
                    </div>
                  )}
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  </div>
  );
}