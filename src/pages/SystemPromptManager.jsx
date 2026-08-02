import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import ModelSettingsPanel from "@/components/ModelSettingsPanel";
import PromptPreviewModal from "@/components/PromptPreviewModal";
import PromptVersionsModal from "@/components/PromptVersionsModal";
import TeacherAuthGuard from "@/components/TeacherAuthGuard";
import SettingsHistoryModal from "@/components/SettingsHistoryModal";
import PostProcessingDashboard from "@/components/PostProcessingDashboard";
import PromptBuilderModal from "@/components/PromptBuilderModal";

const ROLE_LABELS = { driver: "Driver（學生導航）", navigator: "Navigator（AI導航）", solo: "Solo 模式" };
const ROLE_COLORS = {
  driver: "bg-indigo-50 text-indigo-700 border-indigo-200",
  navigator: "bg-amber-50 text-amber-700 border-amber-200",
  solo: "bg-green-50 text-green-700 border-green-200",
};

const glass = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "16px",
};
const inputStyle = {
  background: "rgba(0,0,0,0.04)",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: "10px",
  color: "#1d1d1f",
  outline: "none",
};

const DEFAULT_FORM = {
  label: "",
  role: "driver",
  scope: "global",
  assignment_id: "",
  full_prompt: "",
  display_prompt: "",
  is_active: true,
};

function SystemPromptManagerInner() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {id,...} = edit
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [filterRole, setFilterRole] = useState("all");

  const [previewing, setPreviewing] = useState(null);
  const [viewingVersions, setViewingVersions] = useState(null);
  const [versionCounts, setVersionCounts] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [timingRecord, setTimingRecord] = useState(null);
  const [idleTexts, setIdleTexts] = useState({
    idle_display_text: "（請根據學生目前進度，只提供一個小步驟的提示或一個簡短問題，不要提供完整程式碼。）",
    idle_gemini_text: "學生暫時沒有動作。請只提供一個小步驟的提示，或提出一個簡短問題。請使用台灣繁體中文，不要提供完整程式碼，也不要一次完成整題。",
  });
  const [savingIdle, setSavingIdle] = useState(false);
  const [savedIdle, setSavedIdle] = useState(false);

  const LATEST_DEFAULTS = [
    {
      role: "driver",
      label: "預設 Driver Prompt v3（學生導航）",
      scope: "global",
      is_active: true,
      display_prompt: "這是一個結對程式設計學習平台，現在導航員為「{{participant_id}}」，駕駛員為 Gemini，請根據導航員的指示撰寫 C 語言程式。",
      full_prompt: `【最高優先規則：角色鎖定】
你目前的角色是：駕駛員。
學生目前的角色是：導航員。

這個角色設定的優先權高於所有歷史對話。
如果歷史訊息中出現任何與目前角色不一致的內容，全部視為過期內容，必須忽略。

每次回覆的第一行都必須輸出：
[目前角色：駕駛員]

請使用台灣繁體中文回答。

你現在是程式設計學習平台中的「Driver（駕駛員）」。
學生是「Navigator（導航員）」，由學生主導解題。

請嚴格遵守以下規則：

【角色原則】
1. 你只能執行學生要求的那一步，不可以自行補完後續步驟。
2. 不可以直接提供完整程式碼。
3. 不可以主動完成整題。
4. 不可以自行優化、改寫或補充學生未要求的內容。

【回覆格式】
5. 每次回覆請包含：
   - 一句簡短說明
   - 必要時附上一小段程式碼
6. 每次回覆以 2 到 4 句為原則，需精簡但完整。
7. 不可以只回一行或過度簡略。

【錯誤處理】
8. 若學生指出錯誤，請先用一句話說明錯在哪裡，再給下一步修正。

【防止直接給答案】
9. 若學生要求完整答案，請拒絕直接給出，並改為請他指定下一步。

【語言要求】
10. 一律使用台灣繁體中文，不可使用簡體中文。
11. 用詞請自然、清楚，符合台灣教學情境。

【教學限制】
{{reference_answer}}

【語言與平台限制】
本平台為 C 語言程式設計學習平台，所有程式碼範例與解題引導必須使用 C 語言，不可使用 Python、Java、JavaScript 或其他程式語言。

你的角色是被動執行者，不是解題者。
現在請等待學生（{{participant_id}}）指示。

題目：
{{prompt_text}}`,
    },
    {
      role: "navigator",
      label: "預設 Navigator Prompt v3（AI 導航）",
      scope: "global",
      is_active: true,
      display_prompt: "這是一個結對程式設計學習平台，現在導航員為 Gemini，駕駛員為「{{participant_id}}」，請 Gemini 一步一步指示如何撰寫 C 語言程式。題目：{{prompt_text}}",
      full_prompt: `【最高優先規則：角色鎖定】
你目前的角色是：導航員。
學生目前的角色是：駕駛員。

這個角色設定的優先權高於所有歷史對話。
如果歷史訊息中出現任何與目前角色不一致的內容，全部視為過期內容，必須忽略。

每次回覆的第一行都必須輸出：
[目前角色：導航員]

請使用台灣繁體中文回答。

你現在是程式設計教學中的「Navigator（導航員）」。

請嚴格遵守：

【教學原則】
1. 不可以一次給完整程式碼。
2. 每次只引導一個小步驟。
3. 不可以一次完成超過一個進度。

【回覆格式】
4. 每次回覆請包含：
   - 一句簡短判斷或提示
   - 一句下一步建議
5. 每次回覆以 2 到 4 句為原則，精簡但完整。
6. 必要時可附一小段範例，但不可直接完成整題。

【引導策略】
7. 優先用問題引導，而不是直接給完整答案。
8. 若學生卡住，可提示「下一個最小步驟」。

【防止直接給答案】
9. 若學生要求完整答案，請拒絕，並拆解成下一步。

【語言要求】
10. 一律使用台灣繁體中文，不可使用簡體中文。
11. 用詞請自然、清楚，符合台灣教學情境。

【教學限制】
{{reference_answer}}

【語言與平台限制】
本平台為 C 語言程式設計學習平台，所有程式碼範例與解題引導必須使用 C 語言，不可使用 Python、Java、JavaScript 或其他程式語言。

題目：
{{prompt_text}}`,
    },
    {
      role: "solo",
      label: "預設 Solo Prompt v3（Solo 模式）",
      scope: "global",
      is_active: true,
      display_prompt: "你是一個程式設計學習助理，請協助學生解決 C 語言問題。題目：{{prompt_text}}",
      full_prompt: `【最高優先規則：角色鎖定】
你目前的角色是：程式設計學習助理。

這個角色設定的優先權高於所有歷史對話。
如果歷史訊息中出現任何與目前角色不一致的內容，全部視為過期內容，必須忽略。

每次回覆的第一行都必須輸出：
[目前角色：程式設計學習助理]

請使用台灣繁體中文回答。

你是一個程式設計學習助理，幫助學生自行完成 C 語言程式設計題目。

請遵守以下原則：
1. 不可以一次給出完整程式碼。
2. 每次只引導一個小步驟或提示一個方向。
3. 優先用問題引導學生思考。
4. 若學生卡住，提示「下一個最小步驟」。
5. 若學生要求完整答案，請拒絕並拆解成下一步。
6. 一律使用台灣繁體中文，不可使用簡體中文。

【教學限制】
{{reference_answer}}

【語言與平台限制】
本平台為 C 語言程式設計學習平台，所有程式碼範例與解題引導必須使用 C 語言，不可使用 Python、Java、JavaScript 或其他程式語言。

題目：
{{prompt_text}}`,
    },
  ];

  const load = async () => {
    const [data, versions, timingData] = await Promise.all([
      base44.entities.SystemPrompt.list("-created_date"),
      base44.entities.PromptVersion.list(),
      base44.entities.TimingSettings.list(),
    ]);
    if (timingData.length > 0) {
      setTimingRecord(timingData[0]);
      setIdleTexts({
        idle_display_text: timingData[0].idle_display_text ?? "",
        idle_gemini_text: timingData[0].idle_gemini_text ?? "",
      });
    }

    // Auto-upsert latest default prompts (global scope only)
    // Match by role — if a global prompt exists for this role with a "預設" label prefix, update it
    for (const def of LATEST_DEFAULTS) {
      const existing = data.find(p => p.role === def.role && p.scope === "global" && p.label.startsWith("預設"));
      if (!existing) {
        const hasAny = data.some(p => p.role === def.role && p.scope === "global");
        if (!hasAny) {
          await base44.entities.SystemPrompt.create(def);
        }
      } else if (existing.full_prompt !== def.full_prompt || existing.label !== def.label) {
        await base44.entities.SystemPrompt.update(existing.id, {
          full_prompt: def.full_prompt,
          display_prompt: def.display_prompt,
          label: def.label,
        });
      }
    }

    // Reload after upsert
    const fresh = await base44.entities.SystemPrompt.list("-created_date");
    setPrompts(fresh);

    // Count versions per prompt_id
    const counts = {};
    versions.forEach(v => {
      counts[v.prompt_id] = (counts[v.prompt_id] || 0) + 1;
    });
    setVersionCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(DEFAULT_FORM);
    setEditing({});
  };

  const openEdit = (p) => {
    setForm({
      label: p.label || "",
      role: p.role || "driver",
      scope: p.scope || "global",
      assignment_id: p.assignment_id || "",
      full_prompt: p.full_prompt || "",
      display_prompt: p.display_prompt || "",
      is_active: p.is_active !== false,
    });
    setEditing(p);
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.full_prompt.trim()) return;
    setSaving(true);
    const data = { ...form };
    if (data.scope === "global") data.assignment_id = "";
    if (editing?.id) {
      // Snapshot current version before saving
      await base44.entities.PromptVersion.create({
        prompt_id: editing.id,
        label: editing.label,
        role: editing.role,
        scope: editing.scope,
        assignment_id: editing.assignment_id || "",
        full_prompt: editing.full_prompt,
        display_prompt: editing.display_prompt || "",
        note: form.version_note || "手動儲存",
      });
      await base44.entities.SystemPrompt.update(editing.id, data);
    } else {
      await base44.entities.SystemPrompt.create(data);
    }
    // Write history log
    base44.entities.SettingsChangeLog.create({
      category: "system_prompt",
      role: data.role,
      label: data.label,
      snapshot: JSON.stringify({ scope: data.scope, assignment_id: data.assignment_id || "", display_prompt: (data.display_prompt || "").slice(0, 100), full_prompt_length: data.full_prompt.length }),
    }).catch(() => {});
    await load();
    setSaving(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    await base44.entities.SystemPrompt.delete(id);
    await load();
    setDeleting(null);
  };

  const toggleActive = async (p) => {
    await base44.entities.SystemPrompt.update(p.id, { is_active: !p.is_active });
    await load();
  };

  const saveIdleTexts = async () => {
    setSavingIdle(true);
    if (timingRecord) {
      await base44.entities.TimingSettings.update(timingRecord.id, idleTexts);
    } else {
      const created = await base44.entities.TimingSettings.create(idleTexts);
      setTimingRecord(created);
    }
    setSavingIdle(false);
    setSavedIdle(true);
    setTimeout(() => setSavedIdle(false), 2000);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = prompts.filter(p => filterRole === "all" || p.role === filterRole);

  return (
    <div className="min-h-screen p-4" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0f8ff 100%)" }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.25) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,181,253,0.2) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>
      <div className="max-w-5xl mx-auto" style={{ position: "relative", zIndex: 1 }}>
        {/* Back link */}
        <div className="mb-3">
          <a href="/TeacherDashboard" className="inline-flex items-center gap-1 text-sm transition" style={{ color: "#6e6e73" }}>
            ← 返回教師看板
          </a>
        </div>

        {/* Header */}
        <div className="p-5 mb-4 flex items-center justify-between flex-wrap gap-3" style={glass}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#1d1d1f" }}>System Prompt 管理</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6e6e73" }}>自定義 Gemini 的引導策略，支援全域或任務專屬設定</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPromptBuilder(true)} className="px-4 py-2 text-sm font-semibold transition" style={{ background: "rgba(88,86,214,0.9)", color: "#fff", borderRadius: "10px" }}>
              🧩 動態提示詞設定
            </button>
            <button onClick={() => setShowHistory(true)} className="px-4 py-2 text-sm font-semibold transition" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "10px" }}>
              🕓 參數設定歷史
            </button>
            <button onClick={openNew} className="px-4 py-2 text-sm font-semibold transition" style={{ background: "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }}>
              + 新增 Prompt
            </button>
          </div>
        </div>

        {/* Model Settings */}
        <div className="p-5 mb-4" style={glass}>
          <h2 className="text-sm font-bold mb-1" style={{ color: "#1d1d1f" }}>模型參數設定</h2>
          <p className="text-xs mb-4" style={{ color: "#aeaeb2" }}>分別為三種模式調整 Temperature 與 Max Output Tokens</p>
          <ModelSettingsPanel />
        </div>

        {/* Post Processing Dashboard */}
        <div className="p-5 mb-4" style={glass}>
          <PostProcessingDashboard />
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {["all", "driver", "navigator", "solo"].map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className="px-3 py-1.5 text-xs font-medium transition"
              style={filterRole === r
                ? { background: "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }
                : { background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.85)", color: "#3a3a3c", borderRadius: "10px" }
              }
            >
              {r === "all" ? "全部" : ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ ...glass, color: "#aeaeb2" }}>
            尚無 Prompt，點擊「新增」開始設定
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <div key={p.id} className="p-5 transition" style={{ ...glass, opacity: p.is_active ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm" style={{ color: "#1d1d1f" }}>{p.label}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ROLE_COLORS[p.role] || "bg-gray-100 text-gray-500"}`}>
                        {ROLE_LABELS[p.role] || p.role}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(0,0,0,0.05)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.08)" }}>
                        v{(versionCounts[p.id] || 0) + 1}
                      </span>
                      {p.scope === "task" && p.assignment_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad", border: "1px solid rgba(175,82,222,0.2)" }}>
                          {p.assignment_id}
                        </span>
                      )}
                      {p.scope === "global" && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.08)" }}>全域</span>
                      )}
                      {!p.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,59,48,0.1)", color: "#d70015", border: "1px solid rgba(255,59,48,0.2)" }}>停用</span>
                      )}
                    </div>
                    {p.display_prompt && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold mb-1" style={{ color: "#8e44ad" }}>📱 對話框顯示文字：</p>
                        <p className="text-xs whitespace-pre-wrap px-3 py-2 rounded-lg" style={{ background: "rgba(175,82,222,0.07)", color: "#6d28d9", border: "1px solid rgba(175,82,222,0.15)" }}>
                          {p.display_prompt}
                        </p>
                      </div>
                    )}
                    <div className="mt-2">
                      <p className="text-xs font-semibold mb-1" style={{ color: "#aeaeb2" }}>🤖 實際給 Gemini 的 Prompt：</p>
                      <pre className="text-xs whitespace-pre-wrap p-3 rounded-lg max-h-28 overflow-y-auto font-sans" style={{ background: "rgba(0,0,0,0.03)", color: "#6e6e73", border: "1px solid rgba(0,0,0,0.06)" }}>
                        {p.full_prompt}
                      </pre>
                    </div>
                    {p.role === "navigator" && (
                      <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid rgba(255,149,0,0.2)" }}>
                        <p className="text-xs font-semibold" style={{ color: "#c75000" }}>⏱ 閒置自動提示設定（Navigator 專用）</p>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: "#6e6e73" }}>對話框顯示文字（學生看到的）</label>
                          <textarea
                            value={idleTexts.idle_display_text}
                            onChange={e => setIdleTexts(t => ({ ...t, idle_display_text: e.target.value }))}
                            rows={2}
                            className="w-full px-2 py-1.5 text-xs focus:outline-none"
                            style={{ background: "rgba(255,149,0,0.06)", border: "1px solid rgba(255,149,0,0.25)", borderRadius: "8px", color: "#1d1d1f" }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: "#6e6e73" }}>實際傳送給 Gemini 的文字</label>
                          <textarea
                            value={idleTexts.idle_gemini_text}
                            onChange={e => setIdleTexts(t => ({ ...t, idle_gemini_text: e.target.value }))}
                            rows={3}
                            className="w-full px-2 py-1.5 text-xs font-mono focus:outline-none"
                            style={{ background: "rgba(255,149,0,0.06)", border: "1px solid rgba(255,149,0,0.25)", borderRadius: "8px", color: "#1d1d1f" }}
                          />
                        </div>
                        <button
                          onClick={saveIdleTexts}
                          disabled={savingIdle}
                          className="px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                          style={savedIdle
                            ? { background: "rgba(52,199,89,0.9)", color: "#fff", borderRadius: "8px" }
                            : { background: "rgba(255,149,0,0.9)", color: "#fff", borderRadius: "8px" }
                          }
                        >
                          {savedIdle ? "✓ 已儲存" : savingIdle ? "儲存中…" : "💾 儲存閒置提示"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => setPreviewing(p)} className="px-3 py-1.5 text-xs transition" style={{ background: "rgba(0,122,255,0.1)", color: "#0071e3", border: "1px solid rgba(0,122,255,0.2)", borderRadius: "8px" }}>預覽</button>
                    <button onClick={() => openEdit(p)} className="px-3 py-1.5 text-xs transition" style={{ background: "rgba(0,0,0,0.05)", color: "#3a3a3c", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px" }}>編輯</button>
                    <button onClick={() => setViewingVersions(p)} className="px-3 py-1.5 text-xs transition" style={{ background: "rgba(175,82,222,0.1)", color: "#8e44ad", border: "1px solid rgba(175,82,222,0.2)", borderRadius: "8px" }}>版本</button>
                    <button onClick={() => toggleActive(p)} className="px-3 py-1.5 text-xs transition" style={p.is_active
                      ? { background: "rgba(255,149,0,0.1)", color: "#c75000", border: "1px solid rgba(255,149,0,0.2)", borderRadius: "8px" }
                      : { background: "rgba(52,199,89,0.1)", color: "#1a7f37", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "8px" }
                    }>
                      {p.is_active ? "停用" : "啟用"}
                    </button>
                    <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="px-3 py-1.5 text-xs transition disabled:opacity-50" style={{ background: "rgba(255,59,48,0.1)", color: "#d70015", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "8px" }}>
                      {deleting === p.id ? "刪除中…" : "刪除"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPromptBuilder && (
        <PromptBuilderModal onClose={() => setShowPromptBuilder(false)} />
      )}

      {showHistory && (
        <SettingsHistoryModal onClose={() => setShowHistory(false)} />
      )}

      {/* Modal */}
      {previewing && (
        <PromptPreviewModal prompt={previewing} onClose={() => setPreviewing(null)} />
      )}

      {viewingVersions && (
        <PromptVersionsModal
          prompt={viewingVersions}
          onClose={() => setViewingVersions(null)}
          onRestore={load}
        />
      )}

      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ ...glass, boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <h2 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>{editing?.id ? "編輯 Prompt" : "新增 Prompt"}</h2>
              <button onClick={() => setEditing(null)} className="text-2xl leading-none" style={{ color: "#aeaeb2" }}>×</button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>名稱 *</label>
                <input
                  value={form.label}
                  onChange={e => set("label", e.target.value)}
                  placeholder="例如：W1 Navigator 提示詞"
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>角色 *</label>
                  <select value={form.role} onChange={e => set("role", e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                    <option value="driver">Driver（學生導航）</option>
                    <option value="navigator">Navigator（AI導航）</option>
                    <option value="solo">Solo 模式</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>適用範圍 *</label>
                  <select value={form.scope} onChange={e => set("scope", e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                    <option value="global">全域（所有任務）</option>
                    <option value="task">任務專屬</option>
                  </select>
                </div>
              </div>

              {form.scope === "task" && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>任務 ID（例如 W1_T1）</label>
                  <input value={form.assignment_id} onChange={e => set("assignment_id", e.target.value)} placeholder="W1_T1" className="w-full px-3 py-2 text-sm" style={inputStyle} />
                </div>
              )}

              {editing?.id && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>修改備註（選填）</label>
                  <input value={form.version_note || ""} onChange={e => set("version_note", e.target.value)} placeholder="例如：加入語氣限制、調整回覆長度…" className="w-full px-3 py-2 text-sm" style={inputStyle} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>完整 System Prompt *</label>
                <div className="mb-2 p-3 rounded-lg" style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.15)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#0071e3" }}>📌 可用 Placeholder（系統會自動替換）</p>
                  <div className="flex flex-wrap gap-2">
                    <code className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,122,255,0.2)", color: "#0071e3" }}>{`{{participant_id}}`}</code>
                    <span className="text-xs" style={{ color: "#0071e3" }}>→ 學生 ID（如 PA019）</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <code className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,122,255,0.2)", color: "#0071e3" }}>{`{{prompt_text}}`}</code>
                    <span className="text-xs" style={{ color: "#0071e3" }}>→ 任務題目文字</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <code className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,122,255,0.2)", color: "#0071e3" }}>{`{{reference_answer}}`}</code>
                    <span className="text-xs" style={{ color: "#0071e3" }}>→ 參考答案防護區塊</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: "#5ac8fa" }}>⚠️ DB 模式下，此處的 full_prompt 即為最終送給 Gemini 的完整提示詞。</p>
                </div>
                <textarea
                  value={form.full_prompt}
                  onChange={e => set("full_prompt", e.target.value)}
                  rows={10}
                  placeholder="輸入完整發送給 Gemini 的提示詞..."
                  className="w-full px-3 py-2 text-sm font-mono"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#3a3a3c" }}>顯示說明（選填，顯示在學生對話框中）</label>
                <input value={form.display_prompt} onChange={e => set("display_prompt", e.target.value)} placeholder="例如：現在開始進行 W1_T1 任務指導..." className="w-full px-3 py-2 text-sm" style={inputStyle} />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => set("is_active", e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm" style={{ color: "#3a3a3c" }}>啟用此 Prompt</span>
              </label>
            </div>
            <div className="px-6 py-4 flex gap-3 justify-end flex-shrink-0" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm transition" style={{ background: "rgba(0,0,0,0.06)", color: "#3a3a3c", borderRadius: "10px" }}>取消</button>
              <button onClick={handleSave} disabled={saving || !form.label.trim() || !form.full_prompt.trim()} className="px-4 py-2 text-sm font-semibold disabled:opacity-50 transition" style={{ background: "rgba(0,122,255,0.9)", color: "#fff", borderRadius: "10px" }}>
                {saving ? "儲存中…" : "💾 儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemPromptManager() {
  return (
    <TeacherAuthGuard>
      <SystemPromptManagerInner />
    </TeacherAuthGuard>
  );
}