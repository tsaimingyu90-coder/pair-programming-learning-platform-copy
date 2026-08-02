import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { getChatStatsByParticipant } from "@/utils/chatStats";
import { processBatchWithConcurrencyLimit, generateAIFeedbackForItem, generateAIRatingForItem } from "@/utils/batchAIQueue";
import BatchAIProgressModal from "@/components/BatchAIProgressModal";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import PosttestProgressCell from "@/components/PosttestProgressCell";
import DashboardHeaderButtons from "@/components/DashboardHeaderButtons";

import { exportDashboardCSV } from "@/utils/exportDashboardCSV";

function TeacherDashboardInner() {
  const [participants, setParticipants] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [scaleResponses, setScaleResponses] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [postQuizResults, setPostQuizResults] = useState([]);
  const [postScaleResponses, setPostScaleResponses] = useState([]);
  const [pretestUnlockLogs, setPretestUnlockLogs] = useState([]);
  const [posttestUnlockLogs, setPosttestUnlockLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClasses, setFilterClasses] = useState(["電子二甲", "電子二乙", "電子一甲"]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [filterStatuses, setFilterStatuses] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [sortField, setSortField] = useState('student_id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [assignmentList, setAssignmentList] = useState([]);
  const [hiddenCols, setHiddenCols] = useState(["註冊時間", "登入時間", "完成時間"]);
  // selectedItems supports mixed types:
  // { type: "assignment", participantId, assignmentId }
  // { type: "pretest", participantId, pretestPart }  pretestPart = "P1"|"P2"|"P3"
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedAssignmentCols, setSelectedAssignmentCols] = useState(new Set()); // assignment IDs with all-selected
  const [selectedPretestCols, setSelectedPretestCols] = useState(new Set()); // "P1"|"P2"|"P3" with all-selected
  const [invalidResult, setInvalidResult] = useState(null);
  const [checkingInvalid, setCheckingInvalid] = useState(false);
  const [unlockingPretest, setUnlockingPretest] = useState(false);
  // selectedPosttestIds: Set of "participantDbId::part" strings, e.g. "abc123::P1"
  const [selectedPosttestIds, setSelectedPosttestIds] = useState(new Set());
  const [unlockingPosttest, setUnlockingPosttest] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(null); // 'feedback' | 'rating'
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    currentItem: null,
    results: []
  });

  const [availabilities, setAvailabilities] = useState([]);

  const fetchData = async () => {
    const results = await Promise.allSettled([
      base44.entities.Participant.list(),
      (async () => {
        let allAttempts = [];
        let skip = 0;
        const pageSize = 500;
        while (true) {
          const batch = await base44.entities.Attempt.list('-updated_date', pageSize, skip);
          allAttempts = [...allAttempts, ...batch];
          if (batch.length < pageSize) break;
          skip += pageSize;
        }
        return allAttempts;
      })(),
      base44.entities.QuizResult.filter({ survey_type: "pre" }),
      base44.entities.ScaleResponse.filter({ survey_type: "pre" }),
      base44.entities.QuizResult.filter({ survey_type: "post" }),
      base44.entities.ScaleResponse.filter({ survey_type: "post" }),
      base44.entities.Assignment.list(),
      base44.entities.PretestUnlockLog.list(),
      base44.entities.PosttestUnlockLog.list(),
      (async () => {
        let allLogs = [];
        let skip = 0;
        const pageSize = 5000;
        while (true) {
          const batch = await base44.entities.ChatLog.list("-timestamp", pageSize, skip);
          allLogs = [...allLogs, ...batch];
          if (batch.length < pageSize) break;
          skip += pageSize;
        }
        return allLogs;
      })(),
      base44.entities.AssignmentAvailability.list(),
    ]);
    const [p, a, qr, sr, postQr, postSr, assignments, unlockLogs, posttestLogs, logs, avs] = results.map(r => r.status === 'fulfilled' ? r.value : []);
    setParticipants(p);
    setAttempts(a);
    setQuizResults(qr);
    setScaleResponses(sr);
    setPostQuizResults(postQr || []);
    setPostScaleResponses(postSr || []);
    setAssignmentList(assignments);
    setPretestUnlockLogs(unlockLogs || []);
    setPosttestUnlockLogs(posttestLogs || []);
    setChatLogs(logs);
    setAvailabilities(avs || []);
    setLoading(false);
  };

  const getPreProgress = (participantId) => ({
    quiz: quizResults.some(r => r.participant === participantId),
    anxiety: scaleResponses.some(r => r.participant === participantId && r.part === "anxiety"),
    efficacy: scaleResponses.some(r => r.participant === participantId && r.part === "efficacy"),
  });

  // ── Pretest selection helpers ──────────────────────────────────────────────

  // Is this pretest part selectable? (participant has completed it at least once)
  const isPretestSelectable = (participant, part) => {
    if (part === "P1") return quizResults.some(r => r.participant === participant.id);
    if (part === "P2") return scaleResponses.some(r => r.participant === participant.id && r.part === "anxiety");
    if (part === "P3") return scaleResponses.some(r => r.participant === participant.id && r.part === "efficacy");
    return false;
  };

  const isPretestSelected = (participantId, part) =>
    selectedItems.some(i => i.type === "pretest" && i.participantId === participantId && i.pretestPart === part);

  const togglePretestItem = (participantId, part) => {
    const exists = isPretestSelected(participantId, part);
    if (exists) {
      setSelectedItems(prev => prev.filter(i => !(i.type === "pretest" && i.participantId === participantId && i.pretestPart === part)));
    } else {
      setSelectedItems(prev => [...prev, { type: "pretest", participantId, pretestPart: part }]);
    }
  };

  const togglePretestCol = (part) => {
    const isActive = selectedPretestCols.has(part);
    if (isActive) {
      setSelectedItems(prev => prev.filter(i => !(i.type === "pretest" && i.pretestPart === part)));
      setSelectedPretestCols(prev => { const s = new Set(prev); s.delete(part); return s; });
    } else {
      const newItems = [];
      filteredParticipants.forEach(p => {
        if (isPretestSelectable(p, part) && !isPretestSelected(p.participant_id, part)) {
          newItems.push({ type: "pretest", participantId: p.participant_id, pretestPart: part });
        }
      });
      setSelectedItems(prev => [...prev, ...newItems]);
      setSelectedPretestCols(prev => new Set(prev).add(part));
    }
  };

  // ── Posttest unlock ────────────────────────────────────────────────────────

  // Toggle a single part for a participant
  const togglePosttestSelect = (participantDbId, part) => {
    const key = `${participantDbId}::${part}`;
    setSelectedPosttestIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Check if a specific part is selected for a participant
  const isPosttestPartSelected = (participantDbId, part) =>
    selectedPosttestIds.has(`${participantDbId}::${part}`);

  // Get unique participant DB IDs from the selected set
  const getSelectedParticipantDbIds = () =>
    new Set([...selectedPosttestIds].map(k => k.split("::")[0]));

  // Helper: check if participant has completed a given post part
  const isPostPartDone = (participant, part) => {
    if (part === "P1") return postQuizResults.some(r => r.participant === participant.id);
    if (part === "P2") return postScaleResponses.some(r => r.participant === participant.id && r.part === "anxiety");
    if (part === "P3") return postScaleResponses.some(r => r.participant === participant.id && r.part === "efficacy");
    if (part === "P4") return postScaleResponses.some(r => r.participant === participant.id && r.part === "collaboration");
    return false;
  };

  // Check if a specific part is unlocked for a participant (per-part aware)
  const isPartUnlockedForParticipant = (participantDbId, part) =>
    posttestUnlockLogs.some(l =>
      l.participant_db_id === participantDbId &&
      l.is_active &&
      (l.posttest_part === part || l.posttest_part === "all" || !l.posttest_part)
    );

  // Toggle all participants where this post part is NOT yet done (and not yet unlocked for this part)
  const togglePosttestCol = (part) => {
    const eligible = filteredParticipants.filter(p => !isPartUnlockedForParticipant(p.id, part));
    const targets = eligible.filter(p => !isPostPartDone(p, part));
    const allAlreadySelected = targets.length > 0 && targets.every(p => selectedPosttestIds.has(`${p.id}::${part}`));
    if (allAlreadySelected) {
      setSelectedPosttestIds(prev => {
        const next = new Set(prev);
        targets.forEach(p => next.delete(`${p.id}::${part}`));
        return next;
      });
    } else {
      setSelectedPosttestIds(prev => {
        const next = new Set(prev);
        targets.forEach(p => next.add(`${p.id}::${part}`));
        return next;
      });
    }
  };

  const handlePosttestUnlock = async () => {
    if (selectedPosttestIds.size === 0) return;
    // selectedPosttestIds contains "dbId::part" entries
    const itemCount = selectedPosttestIds.size;
    const participantCount = getSelectedParticipantDbIds().size;
    if (!confirm(`確認解鎖 ${participantCount} 位學生共 ${itemCount} 項後測部分？`)) return;
    setUnlockingPosttest(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    for (const key of selectedPosttestIds) {
      const [dbId, part] = key.split("::");
      const p = filteredParticipants.find(x => x.id === dbId);
      if (!p) continue;
      await base44.entities.PosttestUnlockLog.create({
        participant_id: p.participant_id,
        participant_db_id: p.id,
        posttest_part: part,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
        source_page: "TeacherDashboard",
        is_active: true,
      });
    }
    setSelectedPosttestIds(new Set());
    setUnlockingPosttest(false);
    await fetchData();
    alert(`✅ 已解鎖 ${participantCount} 位學生共 ${itemCount} 項後測`);
  };

  // ── Pretest unlock ─────────────────────────────────────────────────────────

  const handlePretestUnlock = async () => {
    const pretestItems = selectedItems.filter(i => i.type === "pretest");
    if (pretestItems.length === 0) return;
    if (!confirm(`確認解鎖 ${pretestItems.length} 個前測部分？原始資料將完整保留。`)) return;

    setUnlockingPretest(true);
    const user = await base44.auth.me();
    const now = new Date().toISOString();
    const partMap = { P1: "Quiz", P2: "Anxiety", P3: "Efficacy" };

    for (const item of pretestItems) {
      const participant = participants.find(p => p.participant_id === item.participantId);
      if (!participant) continue;
      await base44.entities.PretestUnlockLog.create({
        participant_id: item.participantId,
        participant_db_id: participant.id,
        unlocked_by: user?.email || "admin",
        unlocked_at: now,
        unlock_type: "pretest",
        pretest_part: item.pretestPart,
        source_page: "TeacherDashboard",
        is_active: true,
      });
    }

    setUnlockingPretest(false);
    // Remove pretest items from selection
    setSelectedItems(prev => prev.filter(i => i.type !== "pretest"));
    setSelectedPretestCols(new Set());
    alert(`✅ 已解鎖 ${pretestItems.length} 個前測部分`);
  };

  // ── Batch AI ───────────────────────────────────────────────────────────────

  const handleBatchAI = async (mode) => {
    const assignmentItems = selectedItems.filter(i => i.type === "assignment");
    if (assignmentItems.length === 0) {
      alert("請先選取要處理的任務");
      return;
    }

    setBatchMode(mode);
    setBatchModalOpen(true);
    setBatchProcessing(true);
    setBatchProgress({
      total: assignmentItems.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      currentItem: null,
      results: []
    });

    // 準備項目清單（前端備好所有資料，避免後端再做 DB lookup）
    const items = [];
    const assignmentMap = new Map(assignmentList.map(a => [a.id, a]));

    assignmentItems.forEach(item => {
      const participant = participants.find(p => p.participant_id === item.participantId);
      if (!participant) return;
      
      const attemptData = attempts.filter(a => a.participant === participant.id && a.assignment === item.assignmentId);
      const latestAttempt = attemptData.sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];

      if (latestAttempt && latestAttempt.end_ts) {
        const assignment = assignmentMap.get(item.assignmentId);
        const pureCode = latestAttempt.code_text?.split("\n")
          .filter(l => !/^https?:\/\//.test(l.trim()))
          .join("\n")
          .trim();

        if (!pureCode) return; // 跳過無程式碼項目

        items.push({
          id: `${item.participantId}::${item.assignmentId}`,
          participantId: item.participantId,
          attemptId: latestAttempt.id,
          assignmentId: item.assignmentId,
          pureCode,
          assignment,
        });
      }
    });

    // 執行批次佇列
    const workerFn = mode === 'feedback'
      ? (item) => generateAIFeedbackForItem(item, base44, assignmentMap)
      : (item) => generateAIRatingForItem(item, base44, assignmentMap);

    await processBatchWithConcurrencyLimit(items, workerFn, {
      concurrency: 1,
      delayMs: 1000,
      retries: 1,
      retryDelays: [3000, 8000],
      onProgress: (itemId, status, result, error) => {
        setBatchProgress(prev => {
          const newResults = [...prev.results];
          const existingIdx = newResults.findIndex(r => r.item.id === itemId);
          const matchingItem = items.find(i => i.id === itemId);
          
          if (status === 'processing') {
            if (existingIdx >= 0) {
              newResults[existingIdx] = { item: { id: itemId }, status: 'processing', result: null, error: null };
            } else {
              newResults.push({ item: { id: itemId }, status: 'processing', result: null, error: null });
            }
            return {
              ...prev,
              currentItem: matchingItem,
              results: newResults
            };
          } else if (status === 'success') {
            const processed = prev.processed + 1;
            if (existingIdx >= 0) {
              newResults[existingIdx] = { item: matchingItem, status: 'success', result, error: null };
            } else {
              newResults.push({ item: matchingItem, status: 'success', result, error: null });
            }
            return {
              ...prev,
              processed,
              succeeded: prev.succeeded + 1,
              results: newResults
            };
          } else if (status === 'failed') {
            const processed = prev.processed + 1;
            if (existingIdx >= 0) {
              newResults[existingIdx] = { item: matchingItem, status: 'failed', result: null, error };
            } else {
              newResults.push({ item: matchingItem, status: 'failed', result: null, error });
            }
            return {
              ...prev,
              processed,
              failed: prev.failed + 1,
              results: newResults
            };
          } else if (status === 'skipped') {
            const processed = prev.processed + 1;
            if (existingIdx >= 0) {
              newResults[existingIdx] = { item: matchingItem, status: 'skipped', result, error };
            } else {
              newResults.push({ item: matchingItem, status: 'skipped', result, error });
            }
            return {
              ...prev,
              processed,
              skipped: prev.skipped + 1,
              results: newResults
            };
          }
          return prev;
        });
      }
    });

    // 更新資料並完成
    await fetchData();
    setBatchProcessing(false);
  };

  const getW1Progress = (participantId) => {
    const w1Attempts = attempts.filter(a => a.participant === participantId && a.assignment);
    const assignmentIds = w1Attempts.map(a => a.assignment);
    const w1Assignments = participants.find(p => p.id === participantId) ? assignmentIds.length : 0;
    return w1Assignments;
  };

  // 判斷一個 task 是否「可批改」（已完成 + 有作答 + 尚未評分）
  const isTaskCompletable = (participant, assignmentId) => {
    const attempt = attempts.find(a => a.participant === participant.id && a.assignment === assignmentId && a.end_ts && (a.code_text || a.link_url) && !a.teacher_rating);
    return !!attempt;
  };

  // 1. 任務欄標題一鍵全選：切換該 assignment 的全選狀態
  const toggleAssignmentSelection = (assignmentId) => {
    const isCurrentlySelected = selectedAssignmentCols.has(assignmentId);
    if (isCurrentlySelected) {
      setSelectedItems(prev => prev.filter(item => !(item.type === "assignment" && item.assignmentId === assignmentId)));
      setSelectedAssignmentCols(prev => { const s = new Set(prev); s.delete(assignmentId); return s; });
    } else {
      const newItems = [];
      filteredParticipants.forEach(p => {
        if (isTaskCompletable(p, assignmentId)) {
          const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === assignmentId);
          if (!exists) newItems.push({ type: "assignment", participantId: p.participant_id, assignmentId });
        }
      });
      setSelectedItems(prev => [...prev, ...newItems]);
      setSelectedAssignmentCols(prev => new Set(prev).add(assignmentId));
    }
  };

  // 2. Row checkbox：全選/取消該學生的所有可批改 assignment
  const toggleParticipantSelection = (participant) => {
    const selectableIds = assignmentList
      .filter(a => a.prompt_text)
      .map(a => a.id)
      .filter(aId => isTaskCompletable(participant, aId));

    const alreadySelected = selectedItems.filter(i => i.type === "assignment" && i.participantId === participant.participant_id);
    const allSelected = alreadySelected.length === selectableIds.length && selectableIds.length > 0;

    if (allSelected) {
      setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === participant.participant_id)));
    } else {
      const newItems = [];
      selectableIds.forEach(aId => {
        const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === participant.participant_id && i.assignmentId === aId);
        if (!exists) newItems.push({ type: "assignment", participantId: participant.participant_id, assignmentId: aId });
      });
      setSelectedItems(prev => [...prev, ...newItems]);
    }
  };

  // 3. 快速操作：根據目前篩選結果添加/取代/清除選取
  const addFilteredToSelection = () => {
    const newItems = [];
    filteredParticipants.forEach(p => {
      assignmentList.filter(a => a.prompt_text).forEach(a => {
        if (isTaskCompletable(p, a.id)) {
          const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
          if (!exists) newItems.push({ type: "assignment", participantId: p.participant_id, assignmentId: a.id });
        }
      });
    });
    setSelectedItems(prev => [...prev, ...newItems]);
  };

  const replaceWithFiltered = () => {
    const newItems = [];
    filteredParticipants.forEach(p => {
      assignmentList.filter(a => a.prompt_text).forEach(a => {
        if (isTaskCompletable(p, a.id)) {
          newItems.push({ type: "assignment", participantId: p.participant_id, assignmentId: a.id });
        }
      });
    });
    // Keep existing pretest selections, replace only assignment ones
    setSelectedItems(prev => [...prev.filter(i => i.type === "pretest"), ...newItems]);
  };

  const selectAllFilteredCompletable = () => {
    replaceWithFiltered();
  };

  const clearSelection = () => {
    setSelectedItems([]);
    setSelectedAssignmentCols(new Set());
    setSelectedPretestCols(new Set());
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatus = (participant) => {
    const pa = attempts.filter(a => a.participant === participant.id);
    if (pa.length === 0) return "未開始";
    const latest = pa.sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
    if (latest.end_ts) return "已完成";
    return "進行中";
  };

  const statusColor = (status) => {
    if (status === "已完成") return "bg-green-100 text-green-700 border-green-200";
    if (status === "進行中") return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-gray-100 text-gray-500 border-gray-200";
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortableHeader = ({ field, children }) => {
    const isActive = sortField === field;
    const arrow = sortOrder === 'asc' ? ' ↑' : ' ↓';
    return (
      <th
        onClick={() => handleSort(field)}
        className="text-left px-4 py-3 font-semibold cursor-pointer transition whitespace-nowrap"
        style={{ color: "#1d1d1f" }}
      >
        {children}{isActive && arrow}
      </th>
    );
  };

  const filteredParticipants = participants
    .filter(p => filterClasses.length === 0 || filterClasses.includes(p.class_id))
    .filter(p => filterGroups.length === 0 || filterGroups.includes(p.group))
    .filter(p => filterStatuses.length === 0 || filterStatuses.includes(getStatus(p)))
    .filter(p => {
      if (!searchText.trim()) return true;
      const text = searchText.toLowerCase();
      return (
        (p.name || "").toLowerCase().includes(text) ||
        (p.student_id || "").toLowerCase().includes(text) ||
        (p.participant_id || "").toLowerCase().includes(text)
      );
    });

  const CLASS_TOTALS = { "電子一甲": 22, "電子二甲": 17, "電子二乙": 29 };

  // Calculate "not yet registered" based on active class filters
  const notRegistered = (() => {
    const activeClasses = filterClasses.length > 0
      ? filterClasses
      : Object.keys(CLASS_TOTALS);
    const totalExpected = activeClasses.reduce((sum, cls) => sum + (CLASS_TOTALS[cls] || 0), 0);
    return Math.max(0, totalExpected - filteredParticipants.length);
  })();

  const checkedIn = filteredParticipants.filter(p => attempts.some(a => a.participant === p.id));
  const inProgress = filteredParticipants.filter(p => getStatus(p) === "進行中");
  const done = filteredParticipants.filter(p => {
    const pa = attempts.filter(a => a.participant === p.id);
    return pa.length > 0 && pa.every(a => a.end_ts);
  });

  // Apple glass styles
  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
    borderRadius: "16px",
  };

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #f7f5ff 40%, #f0f9ff 100%)" }}
      onClick={() => setOpenDropdown(null)}
    >
      {/* Ambient blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "40%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "30%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>
      <div className="max-w-6xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f", letterSpacing: "-0.3px" }}>教師看板</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>每 10 秒自動更新 · 共 {participants.length} 位參與者</p>
          </div>
          <DashboardHeaderButtons
            onExportCSV={() => exportDashboardCSV({ participants, attempts, assignmentList, chatLogs, filterClasses, filterGroups, filterStatuses, getStatus, getPreProgress })}
            onCheckInvalid={async () => {
              setCheckingInvalid(true);
              try { const res = await base44.functions.invoke("detectInvalidScaleResponse"); setInvalidResult(res.data); }
              catch (err) { console.error("Invalid check failed:", err); }
              finally { setCheckingInvalid(false); }
            }}
            onRefresh={fetchData}
            checkingInvalid={checkingInvalid}
            invalidResult={invalidResult}
            onPaperQuiz={null}
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-5 text-center" style={glassCard}>
            <p className="text-3xl font-bold" style={{ color: "#1d1d1f" }}>{filteredParticipants.length}</p>
            <p className="text-sm mt-1" style={{ color: "#6e6e73" }}>已註冊</p>
            {notRegistered > 0 && (
              <p className="text-xs text-red-400 mt-1">尚未註冊 {notRegistered} 人</p>
            )}
          </div>
          <div className="p-5 text-center" style={glassCard}>
            <p className="text-3xl font-bold" style={{ color: "#1d1d1f" }}>{checkedIn.length}</p>
            <p className="text-sm mt-1" style={{ color: "#6e6e73" }}>已登入</p>
          </div>
          <div className="p-5 text-center" style={{ ...glassCard, border: "1px solid rgba(59,130,246,0.25)" }}>
            <p className="text-3xl font-bold text-blue-600">{inProgress.length}</p>
            <p className="text-sm mt-1" style={{ color: "#6e6e73" }}>進行中</p>
          </div>
          <div className="p-5 text-center" style={{ ...glassCard, border: "1px solid rgba(16,185,129,0.25)" }}>
            <p className="text-3xl font-bold text-emerald-600">{done.length}</p>
            <p className="text-sm mt-1" style={{ color: "#6e6e73" }}>已完成</p>
          </div>
        </div>

        {/* Search box */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜尋姓名、學號或參與者 ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-4 py-2 text-sm focus:outline-none"
            style={{
              background: "rgba(255,255,255,0.70)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.80)",
              boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
              borderRadius: "12px",
              color: "#1d1d1f",
            }}
          />
        </div>

        {/* 快速選取工具列 */}
        {(() => {
          const assignmentCount = selectedItems.filter(i => i.type === "assignment").length;
          const pretestCount = selectedItems.filter(i => i.type === "pretest").length;
          const hasAnySelected = selectedItems.length > 0 || selectedPosttestIds.size > 0;
          return (
            <div className={`rounded-xl p-3 mb-4 ${!hasAnySelected ? 'hidden' : ''}`} style={{ background: "rgba(255,251,235,0.80)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(251,191,36,0.35)", boxShadow: "0 1px 8px rgba(0,0,0,0.04)", borderRadius: "14px" }}>
              <p className="text-xs font-semibold text-amber-700 mb-2">⚡ 快速選取</p>
              <div className="flex gap-2 flex-wrap items-center">
                <button onClick={selectAllFilteredCompletable} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                  全選任務（篩選）
                </button>
                <button onClick={addFilteredToSelection} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
                  加入任務（篩選）
                </button>
                <button
                  onClick={() => {
                    const newItems = [];
                    filteredParticipants.forEach(p => {
                      assignmentList.filter(a => a.prompt_text).forEach(a => {
                        const att = attempts.find(x => x.participant === p.id && x.assignment === a.id && x.end_ts && (x.code_text || x.link_url));
                        if (att && !att.teacher_rating) {
                          const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                          if (!exists) newItems.push({ type: "assignment", participantId: p.participant_id, assignmentId: a.id });
                        }
                      });
                    });
                    setSelectedItems(prev => [...prev.filter(i => i.type !== "assignment"), ...newItems]);
                  }}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition"
                >
                  選取所有未評分
                </button>
                <button onClick={clearSelection} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition">
                  清除所有選取
                </button>
                <div className="ml-auto flex items-center gap-3 text-xs text-amber-700 font-medium">
                  {assignmentCount > 0 && <span>任務 {assignmentCount} 個</span>}
                  {pretestCount > 0 && <span className="text-teal-700">前測 {pretestCount} 個</span>}
                  {selectedPosttestIds.size > 0 && <span className="text-indigo-700">後測 {getSelectedParticipantDbIds().size} 人（{selectedPosttestIds.size} 項）</span>}
                  {assignmentCount === 0 && pretestCount === 0 && selectedPosttestIds.size === 0 && <span>尚未選取</span>}
                </div>
              </div>
              {/* Action buttons based on selection types */}
              {(selectedItems.length > 0 || selectedPosttestIds.size > 0) && (
                <div className="flex gap-2 flex-wrap mt-2 pt-2" style={{ borderTop: "1px solid rgba(251,191,36,0.3)" }}>
                  {assignmentCount > 0 && (
                    <>
                      <button
                        onClick={() => handleBatchAI('feedback')}
                        disabled={batchProcessing}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition"
                      >
                        ✨ 批次 AI 回饋（{assignmentCount}）
                      </button>
                      <button
                        onClick={() => handleBatchAI('rating')}
                        disabled={batchProcessing}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition"
                      >
                        🏅 批次 AI 等第（{assignmentCount}）
                      </button>
                    </>
                  )}
                  {pretestCount > 0 && (
                    <button
                      onClick={handlePretestUnlock}
                      disabled={unlockingPretest}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition"
                    >
                      {unlockingPretest ? "解鎖中…" : `🔓 前測解鎖（${pretestCount}）`}
                    </button>
                  )}
                  {selectedPosttestIds.size > 0 && (
                    <button
                      onClick={handlePosttestUnlock}
                      disabled={unlockingPosttest}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                      {unlockingPosttest ? "解鎖中…" : `📝 後測解鎖（${getSelectedParticipantDbIds().size} 人）`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* (batch toolbar removed — now integrated into 快速選取) */}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          {/* 班級下拉式複選 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'class' ? null : 'class'); }}
              className="text-xs px-3.5 py-2 font-medium transition flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
            >
              班級 {filterClasses.length > 0 && <span style={{ background: "#0071e3", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{filterClasses.length}</span>} ▾
            </button>
            {openDropdown === 'class' && (
              <div className="absolute top-full left-0 mt-1.5 z-50 min-w-44 overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", borderRadius: "12px" }} onClick={e => e.stopPropagation()}>
                {Array.from(new Set(participants.map(p => p.class_id).filter(Boolean))).map(cls => (
                  <label key={cls} className="flex items-center px-4 py-2.5 cursor-pointer text-sm transition-colors hover:bg-black/5" style={{ color: "#1d1d1f" }}>
                    <input type="checkbox" checked={filterClasses.includes(cls)}
                      onChange={(e) => setFilterClasses(e.target.checked ? [...filterClasses, cls] : filterClasses.filter(c => c !== cls))}
                      className="mr-2.5 accent-blue-500" />
                    {cls}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 組別下拉式複選 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'group' ? null : 'group'); }}
              className="text-xs px-3.5 py-2 font-medium transition flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
            >
              組別 {filterGroups.length > 0 && <span style={{ background: "#0071e3", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{filterGroups.length}</span>} ▾
            </button>
            {openDropdown === 'group' && (
              <div className="absolute top-full left-0 mt-1.5 z-50 min-w-44 overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", borderRadius: "12px" }} onClick={e => e.stopPropagation()}>
                {["AI_Pair", "AI_Solo"].map(g => (
                  <label key={g} className="flex items-center px-4 py-2.5 cursor-pointer text-sm transition-colors hover:bg-black/5" style={{ color: "#1d1d1f" }}>
                    <input type="checkbox" checked={filterGroups.includes(g)}
                      onChange={(e) => setFilterGroups(e.target.checked ? [...filterGroups, g] : filterGroups.filter(g2 => g2 !== g))}
                      className="mr-2.5 accent-blue-500" />
                    {g}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 狀態下拉式複選 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === 'status' ? null : 'status'); }}
              className="text-xs px-3.5 py-2 font-medium transition flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderRadius: "10px", color: "#1d1d1f" }}
            >
              狀態 {filterStatuses.length > 0 && <span style={{ background: "#0071e3", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 10 }}>{filterStatuses.length}</span>} ▾
            </button>
            {openDropdown === 'status' && (
              <div className="absolute top-full left-0 mt-1.5 z-50 min-w-44 overflow-hidden" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", borderRadius: "12px" }} onClick={e => e.stopPropagation()}>
                {["未開始", "進行中", "已完成"].map(s => (
                  <label key={s} className="flex items-center px-4 py-2.5 cursor-pointer text-sm transition-colors hover:bg-black/5" style={{ color: "#1d1d1f" }}>
                    <input type="checkbox" checked={filterStatuses.includes(s)}
                      onChange={(e) => setFilterStatuses(e.target.checked ? [...filterStatuses, s] : filterStatuses.filter(s2 => s2 !== s))}
                      className="mr-2.5 accent-blue-500" />
                    {s}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 顯示欄位按鈕（隱藏欄位時出現） */}
          {hiddenCols.length > 0 && (
            <div className="flex gap-2">
              {["註冊時間", "登入時間", "完成時間"].filter(col => hiddenCols.includes(col)).map(col => (
                <button
                  key={col}
                  onClick={() => setHiddenCols(hiddenCols.filter(c => c !== col))}
                  className="text-xs px-3 py-1.5 font-medium transition"
                  style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, color: "#b45309" }}
                >
                  + {col}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", borderRadius: "16px" }}>
            <table className="min-w-max w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.025)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                  <th className="sticky left-0 z-20 px-3 py-3 text-center w-8" style={{ background: "rgba(248,248,252,0.95)" }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.filter(i => i.type === "assignment").length > 0}
                      onChange={() => {
                        if (selectedItems.filter(i => i.type === "assignment").length > 0) {
                          setSelectedItems(prev => prev.filter(i => i.type !== "assignment"));
                          setSelectedAssignmentCols(new Set());
                        } else selectAllFilteredCompletable();
                      }}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                      title="全選/取消所有可批改項目"
                    />
                  </th>
                  <th onClick={() => handleSort('participant_id')} className="sticky left-8 z-20 text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap w-[88px] min-w-[88px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>參與者 ID{sortField === 'participant_id' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th onClick={() => handleSort('class_id')} className="sticky left-[120px] z-20 text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap w-[80px] min-w-[80px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>班級{sortField === 'class_id' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th onClick={() => handleSort('name')} className="sticky left-[200px] z-20 text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap w-[72px] min-w-[72px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>姓名{sortField === 'name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th onClick={() => handleSort('student_id')} className="sticky left-[272px] z-20 text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap w-[88px] min-w-[88px]" style={{ background: "rgba(248,248,252,0.95)", color: "#1d1d1f" }}>學號{sortField === 'student_id' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <SortableHeader field="group">組別</SortableHeader>
                  <SortableHeader field="status">狀態</SortableHeader>
                  {!hiddenCols.includes("註冊時間") && (
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('created_at')}>
                      註冊時間{sortField === 'created_at' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      <button onClick={e => { e.stopPropagation(); setHiddenCols([...hiddenCols, "註冊時間"]); }} className="ml-1 text-gray-300 hover:text-gray-500 text-xs">✕</button>
                    </th>
                  )}
                  {!hiddenCols.includes("登入時間") && (
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('start_ts')}>
                      登入時間{sortField === 'start_ts' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      <button onClick={e => { e.stopPropagation(); setHiddenCols([...hiddenCols, "登入時間"]); }} className="ml-1 text-gray-300 hover:text-gray-500 text-xs">✕</button>
                    </th>
                  )}
                  {!hiddenCols.includes("完成時間") && (
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('end_ts')}>
                      完成時間{sortField === 'end_ts' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      <button onClick={e => { e.stopPropagation(); setHiddenCols([...hiddenCols, "完成時間"]); }} className="ml-1 text-gray-300 hover:text-gray-500 text-xs">✕</button>
                    </th>
                  )}
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>AI對話時間</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap w-[88px] min-w-[88px]" style={{ color: "#1d1d1f" }}>
                    <div>前測進度</div>
                    <div className="flex gap-1 mt-1">
                      {["P1", "P2", "P3"].map(part => (
                        <button
                          key={part}
                          onClick={() => togglePretestCol(part)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedPretestCols.has(part)
                              ? 'bg-teal-500 text-white border-teal-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-teal-50'
                          }`}
                          title={`全選 ${part}`}
                        >
                          {part}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>後測進度</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {["P1", "P2", "P3", "P4"].map(part => {
                        const eligible = filteredParticipants.filter(fp => !isPartUnlockedForParticipant(fp.id, part));
                        const targets = eligible.filter(fp => !isPostPartDone(fp, part));
                        const colActive = targets.length > 0 && targets.every(fp => selectedPosttestIds.has(`${fp.id}::${part}`));
                        return (
                          <button
                            key={part}
                            onClick={() => togglePosttestCol(part)}
                            className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                              colActive
                                ? 'bg-indigo-500 text-white border-indigo-600'
                                : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-indigo-50'
                            }`}
                            title={`選取「${part} 未完成」的未解鎖學生`}
                          >
                            {part}
                          </button>
                        );
                      })}
                    </div>
                  </th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W1任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 1 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w1_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W1 總分{sortField === 'w1_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W2任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 2 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w2_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W2 總分{sortField === 'w2_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W3任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 3 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w3_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W3 總分{sortField === 'w3_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W4任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 4 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w4_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W4 總分{sortField === 'w4_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W5任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 5 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w5_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W5 總分{sortField === 'w5_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap" style={{ color: "#1d1d1f" }}>
                    <div>W6任務進度</div>
                    <div className="flex gap-1 mt-1">
                      {assignmentList.filter(a => a.week_number === 6 && a.prompt_text).sort((a, b) => a.task_number - b.task_number).map(a => (
                        <button
                          key={a.id}
                          onClick={() => toggleAssignmentSelection(a.id)}
                          className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded border cursor-pointer transition ${
                            selectedAssignmentCols.has(a.id)
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-blue-50'
                          }`}
                          title={`全選 ${a.assignment_id}`}
                        >
                          T{a.task_number}
                        </button>
                      ))}
                    </div>
                  </th>
                  <th onClick={() => handleSort('w6_score')} className="text-left px-3 py-3 font-semibold cursor-pointer transition whitespace-nowrap" style={{ color: "#1d1d1f" }}>W6 總分{sortField === 'w6_score' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}</th>
                  </tr>
              </thead>
              <tbody>
                {filteredParticipants
                 .sort((a, b) => {
                    let aVal, bVal;
                    if (sortField === 'participant_id') {
                      aVal = a.participant_id;
                      bVal = b.participant_id;
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'class_id') {
                      aVal = a.class_id || '';
                      bVal = b.class_id || '';
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'name') {
                      aVal = a.name || '';
                      bVal = b.name || '';
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'student_id') {
                      aVal = a.student_id || '';
                      bVal = b.student_id || '';
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'group') {
                      aVal = a.group || '';
                      bVal = b.group || '';
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'status') {
                      aVal = getStatus(a);
                      bVal = getStatus(b);
                      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (sortField === 'start_ts') {
                      const aAttempt = attempts.filter(att => att.participant === a.id).sort((x, y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
                      const bAttempt = attempts.filter(att => att.participant === b.id).sort((x, y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
                      aVal = aAttempt?.start_ts ? new Date(aAttempt.start_ts).getTime() : 0;
                      bVal = bAttempt?.start_ts ? new Date(bAttempt.start_ts).getTime() : 0;
                      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    } else if (sortField === 'end_ts') {
                      const aAttempt = attempts.filter(att => att.participant === a.id).sort((x, y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
                      const bAttempt = attempts.filter(att => att.participant === b.id).sort((x, y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
                      aVal = aAttempt?.end_ts ? new Date(aAttempt.end_ts).getTime() : 0;
                      bVal = bAttempt?.end_ts ? new Date(bAttempt.end_ts).getTime() : 0;
                      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    } else if (['w1_score','w2_score','w3_score','w4_score','w5_score','w6_score'].includes(sortField)) {
                       const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                       const weekNum = sortField === 'w1_score' ? 1 : sortField === 'w2_score' ? 2 : sortField === 'w3_score' ? 3 : sortField === 'w4_score' ? 4 : sortField === 'w5_score' ? 5 : 6;
                      const weekAssignments = assignmentList.filter(a => a.week_number === weekNum && a.prompt_text).sort((x, y) => x.task_number - y.task_number);
                      const taskCount = weekAssignments.length;
                      const calcScore = (participant) => {
                        if (taskCount === 0) return 0;
                        const participantAttempts = attempts.filter(att => att.participant === participant.id && weekAssignments.map(wt => wt.id).includes(att.assignment));
                        let rawScore = 0;
                        let gradedCount = 0;
                        weekAssignments.forEach(task => {
                          const att = participantAttempts.filter(x => x.assignment === task.id).sort((x, y) => new Date(y.start_ts) - new Date(x.start_ts))[0];
                          if (att?.teacher_rating) {
                            rawScore += RATING_SCORE[att.teacher_rating] || 0;
                            gradedCount++;
                          }
                        });
                        if (gradedCount === 0) return -1;
                        return taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                      };
                      aVal = calcScore(a);
                      bVal = calcScore(b);
                      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                    }
                    return 0;
                  })
                  .map((p) => {
                    const pa = attempts
                      .filter(a => a.participant === p.id)
                      .sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts));
                    const latest = pa[0];
                    const status = getStatus(p);
                    return (
                      <tr key={p.id} className="group transition" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }} onMouseEnter={e => e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        <td className="sticky left-0 z-10 px-3 py-2 text-center w-8" style={{ background: "rgba(250,250,252,0.97)" }}>
                          <input
                            type="checkbox"
                            checked={(() => {
                              const selectableIds = assignmentList.filter(a => a.prompt_text).map(a => a.id).filter(aId => isTaskCompletable(p, aId));
                              const selectedForParticipant = selectedItems.filter(i => i.type === "assignment" && i.participantId === p.participant_id);
                              return selectedForParticipant.length === selectableIds.length && selectableIds.length > 0;
                            })()}
                            onChange={() => toggleParticipantSelection(p)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                            title="全選該學生所有可批改任務"
                          />
                        </td>
                        <td className="sticky left-8 z-10 px-3 py-2 font-medium whitespace-nowrap w-[88px] min-w-[88px]" style={{ background: "rgba(250,250,252,0.97)", color: "#1d1d1f" }}>
                          <a
                            href={`/StudentDetailPage?id=${p.participant_id}`}
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {p.participant_id}
                            {invalidResult?.invalid_records?.some(r => r.participant_id_display === p.participant_id) && (
                              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                              </span>
                            )}
                          </a>
                        </td>
                        <td className="sticky left-[120px] z-10 px-3 py-2 whitespace-nowrap w-[80px] min-w-[80px]" style={{ background: "rgba(250,250,252,0.97)", color: "#3a3a3c" }}>{p.class_id || "—"}</td>
                        <td className="sticky left-[200px] z-10 px-3 py-2 whitespace-nowrap w-[72px] min-w-[72px]" style={{ background: "rgba(250,250,252,0.97)", color: "#3a3a3c" }}>{p.name || "—"}</td>
                        <td className="sticky left-[272px] z-10 px-3 py-2 whitespace-nowrap font-mono w-[88px] min-w-[88px]" style={{ background: "rgba(250,250,252,0.97)", color: "#3a3a3c" }}>{p.student_id || "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                            p.group === "AI_Pair"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {p.group}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusColor(status)}`}>
                            {status === "進行中" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse" />}
                            {status}
                          </span>
                        </td>
                        {!hiddenCols.includes("註冊時間") && (
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {p.created_at ? `${new Date(p.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })} ${new Date(p.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}` : "—"}
                          </td>
                        )}
                        {!hiddenCols.includes("登入時間") && (
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {latest?.start_ts
                              ? `${new Date(latest.start_ts).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })} ${new Date(latest.start_ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                              : "—"}
                          </td>
                        )}
                        {!hiddenCols.includes("完成時間") && (
                          <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                            {latest?.end_ts
                              ? `${new Date(latest.end_ts).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })} ${new Date(latest.end_ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                              : "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {(() => {
                            const stats = getChatStatsByParticipant(chatLogs, p.id);
                            return stats.conversation_active_minutes > 0 ? `${stats.conversation_active_minutes} 分鐘` : "—";
                          })()}
                        </td>
                        <td className="px-3 py-2 w-[88px] min-w-[88px]">
                          {(() => {
                            const prog = getPreProgress(p.id);
                            const invalidRecs = invalidResult?.invalid_records?.filter(r => r.participant_id_display === p.participant_id) || [];
                            const invalidTypes = new Set(invalidRecs.map(r => r.scale_type));
                            // Part → unlock log 對應
                            const partToUnlockPart = { P1: "P1", P2: "P2", P3: "P3" };
                            // 各 part 的分數筆數
                            const scoreCount = {
                              P1: quizResults.filter(r => r.participant === p.id).length,
                              P2: scaleResponses.filter(r => r.participant === p.id && r.part === "anxiety").length,
                              P3: scaleResponses.filter(r => r.participant === p.id && r.part === "efficacy").length,
                            };
                            const parts = [
                              { label: "P1", done: prog.quiz, invalidType: "quiz" },
                              { label: "P2", done: prog.anxiety, invalidType: "anxiety" },
                              { label: "P3", done: prog.efficacy, invalidType: "efficacy" },
                            ];
                            return (
                              <div className="flex gap-1">
                                {parts.map(({ label, done, invalidType }) => {
                                  const isInvalid = invalidTypes.has(invalidType);
                                  const isSelected = isPretestSelected(p.participant_id, label);
                                  const isSelectable = done;
                                  // 是否有解鎖紀錄（任何 is_active 狀態皆算）
                                  const hasUnlock = pretestUnlockLogs.some(
                                    l => l.participant_db_id === p.id && (!l.pretest_part || l.pretest_part === partToUnlockPart[label])
                                  );
                                  const scores = scoreCount[label] || 0;
                                  // 顏色判斷：
                                  // selected → teal ring
                                  // !done → 灰色
                                  // done && !hasUnlock → 綠色
                                  // done && hasUnlock && scores < 2 → 橘色
                                  // done && hasUnlock && scores >= 2 → 深綠+橘色邊框（堆疊）
                                  let colorClass;
                                  if (isSelected) {
                                    colorClass = "ring-2 ring-offset-1 ring-teal-500 bg-teal-100 text-teal-700 border-teal-400";
                                  } else if (!done) {
                                    colorClass = "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
                                  } else if (hasUnlock && scores >= 2) {
                                    colorClass = "bg-green-200 text-green-800 border-orange-400 ring-1 ring-orange-300 cursor-pointer hover:opacity-80";
                                  } else if (hasUnlock) {
                                    colorClass = "bg-orange-100 text-orange-700 border-orange-400 cursor-pointer hover:opacity-80";
                                  } else {
                                    colorClass = "bg-green-100 text-green-700 border-green-300 hover:bg-teal-50 hover:border-teal-300 cursor-pointer";
                                  }
                                  return (
                                    <span key={label} className="relative inline-flex">
                                      <button
                                        onClick={() => isSelectable && togglePretestItem(p.participant_id, label)}
                                        disabled={!isSelectable}
                                        className={`text-xs w-7 h-5 inline-flex items-center justify-center rounded font-bold border transition ${colorClass}`}
                                        title={!done ? `${label} 尚未完成` : hasUnlock ? `${label} 有解鎖紀錄（${scores} 筆分數）` : isSelected ? `取消選取 ${label}` : `選取 ${label}`}
                                      >
                                        {isSelected ? "✓" : label}
                                      </button>
                                      {isInvalid && (
                                        <span className="absolute -top-1 -right-1 flex h-2 w-2 pointer-events-none">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <PosttestProgressCell
                            participant={p}
                            postQuizResults={postQuizResults}
                            postScaleResponses={postScaleResponses}
                            posttestUnlockLogs={posttestUnlockLogs}
                            isPosttestPartSelected={isPosttestPartSelected}
                            onToggleSelect={togglePosttestSelect}
                            invalidResult={invalidResult}
                          />
                        </td>
                        <td className="px-3 py-2">
                         {(() => {
                           const w1Assignments = assignmentList.filter(a => a.week_number === 1 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                           const w1AssignmentIds = new Set(w1Assignments.map(a => a.id));
                           const participantAttempts = attempts
                              .filter(a => a.participant === p.id && w1AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                           const completedMap = {};
                           participantAttempts.forEach(a => {
                             const ts = new Date(a.start_ts).getTime();
                             if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                               completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                             }
                           });
                            const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                            return (
                              <div className="flex gap-1 flex-wrap">
                                {w1Assignments.map(a => {
                                  const inMap = a.id in completedMap;
                                  const ratingObj = completedMap[a.id];
                                  const rating = ratingObj?.rating;
                                  const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                  const classAv = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                  const isOpen = classAv !== undefined ? classAv.is_open : a.is_open === true;
                                         const colorClass = isSelected
                                           ? "ring-2 ring-offset-1 ring-blue-500"
                                           : inMap
                                           ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                           : isOpen
                                           ? "bg-gray-100 text-gray-400 border-gray-200"
                                           : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                         return (
                                           <button
                                             key={a.id}
                                             onClick={() => {
                                               const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                               if (exists) {
                                                 setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                               } else {
                                                 setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                               }
                                             }}
                                             className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                             title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                           >
                                             {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                           </button>
                                         );
                                       })}
                                     </div>
                                   );
                                  })()}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-center">
                                  {(() => {
                                   const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                                   const w1Assignments = assignmentList.filter(a => a.week_number === 1 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                            const taskCount = w1Assignments.length;
                            if (taskCount === 0) return "—";
                            const participantAttempts = attempts.filter(a => a.participant === p.id && w1Assignments.map(wt => wt.id).includes(a.assignment));
                            let rawScore = 0;
                            let gradedCount = 0;
                            w1Assignments.forEach(task => {
                              const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                              if (att?.teacher_rating) {
                                rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                gradedCount++;
                              }
                            });
                            const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                            return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const w2Assignments = assignmentList.filter(a => a.week_number === 2 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                            const w2AssignmentIds = new Set(w2Assignments.map(a => a.id));
                            const participantAttempts = attempts
                               .filter(a => a.participant === p.id && w2AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                            const completedMap = {};
                            participantAttempts.forEach(a => {
                              const ts = new Date(a.start_ts).getTime();
                              if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                                completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                              }
                            });
                            const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                            return (
                              <div className="flex gap-1 flex-wrap">
                                {w2Assignments.map(a => {
                                  const inMap = a.id in completedMap;
                                  const ratingObj = completedMap[a.id];
                                  const rating = ratingObj?.rating;
                                  const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                  const classAvW2 = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                  const isOpen = classAvW2 !== undefined ? classAvW2.is_open : a.is_open === true;
                                  const colorClass = isSelected
                                    ? "ring-2 ring-offset-1 ring-blue-500"
                                    : inMap
                                    ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                    : isOpen
                                    ? "bg-gray-100 text-gray-400 border-gray-200"
                                    : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                  return (
                                    <button
                                      key={a.id}
                                      onClick={() => {
                                        const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                        if (exists) {
                                          setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                        } else {
                                          setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                        }
                                      }}
                                      className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                      title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                    >
                                      {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                    </button>
                                  );
                                  })}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 font-semibold text-center">
                           {(() => {
                             const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                             const w2Assignments = assignmentList.filter(a => a.week_number === 2 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const taskCount = w2Assignments.length;
                             if (taskCount === 0) return "—";
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w2Assignments.map(wt => wt.id).includes(a.assignment));
                             let rawScore = 0;
                             let gradedCount = 0;
                             w2Assignments.forEach(task => {
                               const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                               if (att?.teacher_rating) {
                                 rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                 gradedCount++;
                               }
                             });
                             const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                             return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                           })()}
                         </td>
                         <td className="px-3 py-2">
                           {(() => {
                             const w3Assignments = assignmentList.filter(a => a.week_number === 3 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const w3AssignmentIds = new Set(w3Assignments.map(a => a.id));
                             const participantAttempts = attempts
                                .filter(a => a.participant === p.id && w3AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                             const completedMap = {};
                             participantAttempts.forEach(a => {
                               const ts = new Date(a.start_ts).getTime();
                               if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                                 completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                               }
                             });
                             const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                             return (
                               <div className="flex gap-1 flex-wrap">
                                 {w3Assignments.map(a => {
                                   const inMap = a.id in completedMap;
                                   const ratingObj = completedMap[a.id];
                                   const rating = ratingObj?.rating;
                                   const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                   const classAvX = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                   const isOpen = classAvX !== undefined ? classAvX.is_open : a.is_open === true;
                                   const colorClass = isSelected
                                     ? "ring-2 ring-offset-1 ring-blue-500"
                                     : inMap
                                     ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                     : isOpen
                                     ? "bg-gray-100 text-gray-400 border-gray-200"
                                     : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                   return (
                                     <button
                                       key={a.id}
                                       onClick={() => {
                                         const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                         if (exists) {
                                           setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                         } else {
                                           setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                         }
                                       }}
                                       className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                       title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                     >
                                       {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                     </button>
                                   );
                                 })}
                               </div>
                             );
                           })()}
                         </td>
                         <td className="px-3 py-2 font-semibold text-center">
                           {(() => {
                             const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                             const w3Assignments = assignmentList.filter(a => a.week_number === 3 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const taskCount = w3Assignments.length;
                             if (taskCount === 0) return "—";
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w3Assignments.map(wt => wt.id).includes(a.assignment));
                             let rawScore = 0;
                             let gradedCount = 0;
                             w3Assignments.forEach(task => {
                               const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                               if (att?.teacher_rating) {
                                 rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                 gradedCount++;
                               }
                             });
                             const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                             return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                           })()}
                         </td>
                         <td className="px-3 py-2">
                           {(() => {
                             const w4Assignments = assignmentList.filter(a => a.week_number === 4 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const w4AssignmentIds = new Set(w4Assignments.map(a => a.id));
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w4AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                             const completedMap = {};
                             participantAttempts.forEach(a => {
                               const ts = new Date(a.start_ts).getTime();
                               if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                                 completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                               }
                             });
                             const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                             return (
                               <div className="flex gap-1 flex-wrap">
                                 {w4Assignments.map(a => {
                                   const inMap = a.id in completedMap;
                                   const ratingObj = completedMap[a.id];
                                   const rating = ratingObj?.rating;
                                   const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                   const classAvX = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                   const isOpen = classAvX !== undefined ? classAvX.is_open : a.is_open === true;
                                   const colorClass = isSelected
                                     ? "ring-2 ring-offset-1 ring-blue-500"
                                     : inMap
                                     ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                     : isOpen
                                     ? "bg-gray-100 text-gray-400 border-gray-200"
                                     : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                   return (
                                     <button
                                       key={a.id}
                                       onClick={() => {
                                         const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                         if (exists) {
                                           setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                         } else {
                                           setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                         }
                                       }}
                                       className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                       title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                     >
                                       {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                     </button>
                                   );
                                 })}
                               </div>
                             );
                           })()}
                         </td>
                         <td className="px-3 py-2 font-semibold text-center">
                           {(() => {
                             const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                             const w4Assignments = assignmentList.filter(a => a.week_number === 4 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const taskCount = w4Assignments.length;
                             if (taskCount === 0) return "—";
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w4Assignments.map(wt => wt.id).includes(a.assignment));
                             let rawScore = 0;
                             let gradedCount = 0;
                             w4Assignments.forEach(task => {
                               const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                               if (att?.teacher_rating) {
                                 rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                 gradedCount++;
                               }
                             });
                             const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                             return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                           })()}
                         </td>
                         <td className="px-3 py-2">
                           {(() => {
                             const w5Assignments = assignmentList.filter(a => a.week_number === 5 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const w5AssignmentIds = new Set(w5Assignments.map(a => a.id));
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w5AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                             const completedMap = {};
                             participantAttempts.forEach(a => {
                               const ts = new Date(a.start_ts).getTime();
                               if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                                 completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                               }
                             });
                             const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                             return (
                               <div className="flex gap-1 flex-wrap">
                                 {w5Assignments.map(a => {
                                   const inMap = a.id in completedMap;
                                   const ratingObj = completedMap[a.id];
                                   const rating = ratingObj?.rating;
                                   const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                   const classAvX = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                   const isOpen = classAvX !== undefined ? classAvX.is_open : a.is_open === true;
                                   const colorClass = isSelected
                                     ? "ring-2 ring-offset-1 ring-blue-500"
                                     : inMap
                                     ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                     : isOpen
                                     ? "bg-gray-100 text-gray-400 border-gray-200"
                                     : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                   return (
                                     <button
                                       key={a.id}
                                       onClick={() => {
                                         const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                         if (exists) {
                                           setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                         } else {
                                           setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                         }
                                       }}
                                       className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                       title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                     >
                                       {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                     </button>
                                   );
                                 })}
                               </div>
                             );
                           })()}
                         </td>
                         <td className="px-3 py-2 font-semibold text-center">
                           {(() => {
                             const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                             const w5Assignments = assignmentList.filter(a => a.week_number === 5 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const taskCount = w5Assignments.length;
                             if (taskCount === 0) return "—";
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w5Assignments.map(wt => wt.id).includes(a.assignment));
                             let rawScore = 0;
                             let gradedCount = 0;
                             w5Assignments.forEach(task => {
                               const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                               if (att?.teacher_rating) {
                                 rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                 gradedCount++;
                               }
                             });
                             const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                             return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                           })()}
                         </td>
                         <td className="px-3 py-2">
                           {(() => {
                             const w6Assignments = assignmentList.filter(a => a.week_number === 6 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const w6AssignmentIds = new Set(w6Assignments.map(a => a.id));
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w6AssignmentIds.has(a.assignment) && (a.end_ts || a.teacher_rating));
                             const completedMap = {};
                             participantAttempts.forEach(a => {
                               const ts = new Date(a.start_ts).getTime();
                               if (!completedMap[a.assignment] || ts > completedMap[a.assignment].ts) {
                                 completedMap[a.assignment] = { rating: a.teacher_rating || null, ts };
                               }
                             });
                             const RATING_COLOR = { "優": "bg-green-100 text-green-700 border-green-300", "甲": "bg-blue-100 text-blue-700 border-blue-300", "乙": "bg-yellow-100 text-yellow-700 border-yellow-300", "丙": "bg-orange-100 text-orange-700 border-orange-300", "丁": "bg-red-100 text-red-700 border-red-300" };
                             return (
                               <div className="flex gap-1 flex-wrap">
                                 {w6Assignments.map(a => {
                                   const inMap = a.id in completedMap;
                                   const ratingObj = completedMap[a.id];
                                   const rating = ratingObj?.rating;
                                   const isSelected = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                   const classAvX = availabilities.find(av => av.assignment === a.id && av.class_id === p.class_id);
                                   const isOpen = classAvX !== undefined ? classAvX.is_open : a.is_open === true;
                                   const colorClass = isSelected
                                     ? "ring-2 ring-offset-1 ring-blue-500"
                                     : inMap
                                     ? (rating ? RATING_COLOR[rating] : "bg-green-100 text-green-700 border-green-300")
                                     : isOpen
                                     ? "bg-gray-100 text-gray-400 border-gray-200"
                                     : "bg-gray-50 text-gray-300 border-gray-150 opacity-50";
                                   return (
                                     <button
                                       key={a.id}
                                       onClick={() => {
                                         const exists = selectedItems.some(i => i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id);
                                         if (exists) {
                                           setSelectedItems(prev => prev.filter(i => !(i.type === "assignment" && i.participantId === p.participant_id && i.assignmentId === a.id)));
                                         } else {
                                           setSelectedItems(prev => [...prev, { type: "assignment", participantId: p.participant_id, assignmentId: a.id }]);
                                         }
                                       }}
                                       className={`inline-flex items-center justify-center w-7 h-6 text-xs font-bold rounded border ${colorClass} cursor-pointer transition hover:opacity-80`}
                                       title={rating ? `T${a.task_number}: ${rating}` : inMap ? `T${a.task_number}: 待評分` : isOpen ? `T${a.task_number}: 未完成` : `T${a.task_number}: 未開放`}
                                     >
                                       {isSelected ? "✓" : (inMap ? (rating || "✓") : `T${a.task_number}`)}
                                     </button>
                                   );
                                 })}
                               </div>
                             );
                           })()}
                         </td>
                         <td className="px-3 py-2 font-semibold text-center">
                           {(() => {
                             const RATING_SCORE = { "優": 9.5, "甲": 8.5, "乙": 7.5, "丙": 6.5, "丁": 5.5 };
                             const w6Assignments = assignmentList.filter(a => a.week_number === 6 && a.prompt_text).sort((a, b) => a.task_number - b.task_number);
                             const taskCount = w6Assignments.length;
                             if (taskCount === 0) return "—";
                             const participantAttempts = attempts.filter(a => a.participant === p.id && w6Assignments.map(wt => wt.id).includes(a.assignment));
                             let rawScore = 0;
                             let gradedCount = 0;
                             w6Assignments.forEach(task => {
                               const att = participantAttempts.filter(x => x.assignment === task.id).sort((a, b) => new Date(b.start_ts) - new Date(a.start_ts))[0];
                               if (att?.teacher_rating) {
                                 rawScore += RATING_SCORE[att.teacher_rating] || 0;
                                 gradedCount++;
                               }
                             });
                             const totalScore = taskCount < 10 ? rawScore * (10 / taskCount) : rawScore;
                             return gradedCount > 0 ? <span className="text-blue-600 font-bold">{totalScore.toFixed(1)}</span> : "—";
                           })()}
                         </td>
                         </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* 批次進度模態框 */}
        <BatchAIProgressModal
          isOpen={batchModalOpen}
          mode={batchMode}
          total={batchProgress.total}
          processed={batchProgress.processed}
          succeeded={batchProgress.succeeded}
          failed={batchProgress.failed}
          skipped={batchProgress.skipped}
          currentItem={batchProgress.currentItem}
          isProcessing={batchProcessing}
          results={batchProgress.results}
          onClose={() => {
            if (!batchProcessing) {
              setBatchModalOpen(false);
              setSelectedItems([]);
            }
          }}
          onRetryFailed={async () => {
            const failedItems = batchProgress.results.filter(r => r.status === 'failed').map(r => r.item);
            if (failedItems.length === 0) return;

            setBatchProcessing(true);
            const assignmentMap = new Map(assignmentList.map(a => [a.id, a]));
            const workerFn = batchMode === 'feedback'
              ? (item) => generateAIFeedbackForItem(item, base44, assignmentMap)
              : (item) => generateAIRatingForItem(item, base44, assignmentMap);

            await processBatchWithConcurrencyLimit(failedItems, workerFn, {
              concurrency: 1,
              delayMs: 1000,
              retries: 1,
              retryDelays: [3000, 8000],
              onProgress: (itemId, status, result, error) => {
                setBatchProgress(prev => {
                  const newResults = prev.results.map(r => 
                    r.item.id === itemId 
                      ? { ...r, status, result, error }
                      : r
                  );
                  const processed = status !== 'processing' ? prev.processed + 1 : prev.processed;
                  return {
                    ...prev,
                    processed,
                    succeeded: status === 'success' ? prev.succeeded + 1 : prev.succeeded,
                    failed: status === 'failed' ? prev.failed + 1 : prev.failed,
                    skipped: status === 'skipped' ? prev.skipped + 1 : prev.skipped,
                    results: newResults
                  };
                });
              }
            });

            await fetchData();
            setBatchProcessing(false);
          }}
        />
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  return (
    <TeacherAuthGuard>
      <TeacherDashboardInner />
    </TeacherAuthGuard>
  );
}