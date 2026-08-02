import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULTS = {
  role_swap_interval: 600,
  auto_prompt_secs: 150,
  idle_display_text: "（請根據學生目前進度，只提供一個小步驟的提示或一個簡短問題，不要提供完整程式碼。）",
  idle_gemini_text: "學生暫時沒有動作。請只提供一個小步驟的提示，或提出一個簡短問題。請使用台灣繁體中文，不要提供完整程式碼，也不要一次完成整題。",
};

function fmt(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function Slider({ label, hint, value, min, max, step, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        <span className="text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
          {fmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

export default function TimingSettingsPanel() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    base44.entities.TimingSettings.list().then(data => {
      if (data.length > 0) {
        const d = data[0];
        setRecordId(d.id);
        setSettings({
          role_swap_interval: d.role_swap_interval ?? DEFAULTS.role_swap_interval,
          auto_prompt_secs: d.auto_prompt_secs ?? DEFAULTS.auto_prompt_secs,
          idle_display_text: d.idle_display_text ?? DEFAULTS.idle_display_text,
          idle_gemini_text: d.idle_gemini_text ?? DEFAULTS.idle_gemini_text,
        });
      }
      setLoaded(true);
    });
  }, []);

  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const save = async () => {
    setSaving(true);
    if (recordId) {
      await base44.entities.TimingSettings.update(recordId, settings);
    } else {
      const created = await base44.entities.TimingSettings.create(settings);
      setRecordId(created.id);
    }
    // Write history log
    base44.entities.SettingsChangeLog.create({
      category: "timing_settings",
      role: "timing",
      label: "計時設定",
      snapshot: JSON.stringify({ role_swap_interval: settings.role_swap_interval, auto_prompt_secs: settings.auto_prompt_secs }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!loaded) return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <Slider
        label="角色切換間隔（Phase 0 ↔ Phase 1）"
        hint="AI_Pair 模式下，學生導航與 AI 導航自動切換的時間"
        value={settings.role_swap_interval}
        min={60}
        max={1800}
        step={30}
        onChange={val => update("role_swap_interval", val)}
      />
      <Slider
        label="自動提示間隔（閒置後 Gemini 主動提示）"
        hint="Navigator 模式（AI導航）下，學生閒置超過此時間後 Gemini 會自動給一步提示"
        value={settings.auto_prompt_secs}
        min={30}
        max={600}
        step={15}
        onChange={val => update("auto_prompt_secs", val)}
      />
      <button
        onClick={save}
        disabled={saving}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition ${
          saved ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        }`}
      >
        {saved ? "✓ 已儲存" : saving ? "儲存中…" : "💾 儲存計時設定"}
      </button>
    </div>
  );
}