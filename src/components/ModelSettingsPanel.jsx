import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import TimingSettingsPanel from "@/components/TimingSettingsPanel";

const ROLES = [
  { key: "driver", label: "學生導航（Driver）", color: "indigo" },
  { key: "navigator", label: "AI導航（Navigator）", color: "amber" },
  { key: "solo", label: "Solo 模式", color: "green" },
];

const DEFAULTS = { temperature: 0.25, max_output_tokens: 220 };

function Slider({ label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
          {display ?? value}
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
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function ModelSettingsPanel() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    base44.entities.ModelSettings.list().then(data => {
      const map = {};
      ROLES.forEach(r => {
        const found = data.find(d => d.role === r.key);
        map[r.key] = found
          ? { id: found.id, temperature: found.temperature ?? DEFAULTS.temperature, max_output_tokens: found.max_output_tokens ?? DEFAULTS.max_output_tokens }
          : { id: null, temperature: DEFAULTS.temperature, max_output_tokens: DEFAULTS.max_output_tokens };
      });
      setSettings(map);
      setLoaded(true);
    });
  }, []);

  const update = (role, key, val) => {
    setSettings(s => ({ ...s, [role]: { ...s[role], [key]: val } }));
  };

  const save = async (role) => {
    setSaving(s => ({ ...s, [role]: true }));
    const entry = settings[role];
    const payload = { role, temperature: entry.temperature, max_output_tokens: entry.max_output_tokens };
    if (entry.id) {
      await base44.entities.ModelSettings.update(entry.id, payload);
    } else {
      const created = await base44.entities.ModelSettings.create(payload);
      setSettings(s => ({ ...s, [role]: { ...s[role], id: created.id } }));
    }
    // Write history log
    base44.entities.SettingsChangeLog.create({
      category: "model_settings",
      role,
      label: ROLES.find(r => r.key === role)?.label || role,
      snapshot: JSON.stringify({ temperature: entry.temperature, max_output_tokens: entry.max_output_tokens }),
    }).catch(() => {});
    setSaving(s => ({ ...s, [role]: false }));
  };

  if (!loaded) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  const pairRoles = ROLES.filter(r => r.key !== "solo");
  const soloRole = ROLES.find(r => r.key === "solo");

  const renderCard = ({ key, label, color }) => {
    const s = settings[key] || DEFAULTS;
    const colorMap = {
      indigo: "border-indigo-200 bg-indigo-50",
      amber: "border-amber-200 bg-amber-50",
      green: "border-green-200 bg-green-50",
    };
    const labelMap = {
      indigo: "text-indigo-700",
      amber: "text-amber-700",
      green: "text-green-700",
    };
    return (
      <div key={key} className={`rounded-2xl border p-5 ${colorMap[color]}`}>
        <h3 className={`text-sm font-bold mb-4 ${labelMap[color]}`}>{label}</h3>
        <div className="space-y-5">
          <Slider
            label="Temperature"
            value={s.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={val => update(key, "temperature", val)}
          />
          <Slider
            label="Max Output Tokens"
            value={s.max_output_tokens}
            min={50}
            max={2048}
            step={10}
            onChange={val => update(key, "max_output_tokens", val)}
          />
        </div>
        <button
          onClick={() => save(key)}
          disabled={saving[key]}
          className="mt-5 w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {saving[key] ? "儲存中…" : "💾 儲存"}
        </button>
      </div>
    );
  };

  return (
    <div className="flex gap-4 items-stretch">
      {/* Left: Driver + Navigator + Timing */}
      <div className="flex flex-col gap-4" style={{ flex: '2' }}>
        <div className="grid grid-cols-2 gap-4">
          {pairRoles.map(renderCard)}
        </div>
        <div className="border border-gray-200 rounded-2xl p-5 bg-white flex-1">
          <h3 className="text-sm font-bold text-gray-700 mb-1">計時設定</h3>
          <p className="text-xs text-gray-400 mb-4">適用於 AI_Pair 模式（Driver / Navigator），不影響 Solo 模式</p>
          <TimingSettingsPanel />
        </div>
      </div>

      {/* Right: Solo */}
      <div style={{ flex: '1' }} className="flex">
        <div className="flex-1">
          {(() => {
            const { key, label, color } = soloRole;
            const s = settings[key] || DEFAULTS;
            return (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 h-full flex flex-col">
                <h3 className="text-sm font-bold mb-4 text-green-700">{label}</h3>
                <div className="space-y-5 flex-1">
                  <Slider
                    label="Temperature"
                    value={s.temperature}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={val => update(key, "temperature", val)}
                  />
                  <Slider
                    label="Max Output Tokens"
                    value={s.max_output_tokens}
                    min={50}
                    max={2048}
                    step={10}
                    onChange={val => update(key, "max_output_tokens", val)}
                  />
                </div>
                <button
                  onClick={() => save(key)}
                  disabled={saving[key]}
                  className="mt-5 w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
                >
                  {saving[key] ? "儲存中…" : "💾 儲存"}
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}