import { useState } from "react";
import { perfStart, logPerf } from "@/hooks/usePerf";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { useRateLimit } from "@/hooks/useRateLimit";
import { logSecurityEvent } from "@/utils/securityGuard";

const CLASS_PREFIXES = {
  "電子一甲": "PA",
  "電子二甲": "AA",
  "電子二乙": "SA",
  "電子一乙": "PB",
};

const CLASS_GROUP = {
  "電子一甲": "AI_Pair",
  "電子一乙": "AI_Pair",
  "電子二甲": "AI_Pair",
  "電子二乙": "AI_Solo",
};

const CLASS_OPTIONS = ["電子一甲", "電子一乙", "電子二甲", "電子二乙"];
const GENDER_OPTIONS = ["男", "女", "其他"];

const EXPERIENCE_OPTIONS = [];
for (let i = 0; i <= 20; i++) {
  EXPERIENCE_OPTIONS.push(i * 0.5);
}

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    student_id: "",
    password: "",
    class_id: "電子一甲",
    gender: "男",
    years_experience: 0,
    consent: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // assigned participant_id
  const registerRateLimit = useRateLimit("register", 3, 60000);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (registerRateLimit.isBlocked()) {
      logSecurityEvent({ page: "Register", event_type: "repeated_login_attempt", risk_level: "high", message: "Register rate limit hit" });
      return setError(`嘗試次數過多，請稍後再試（還需 ${registerRateLimit.getWaitSeconds()} 秒）。`);
    }
    if (!form.name.trim()) return setError("請填寫姓名。");
    if (!form.student_id.trim()) return setError("請填寫學號。");
    if (!form.password.trim()) return setError("請設定密碼。");
    if (!form.consent) return setError("請勾選同意參與研究。");

    setLoading(true);

    // Check if student_id already registered
    const existing = await base44.entities.Participant.filter({ student_id: form.student_id.trim() });
    if (existing.length > 0) {
      setError("此學號已完成註冊，請直接前往 Check-in。");
      setLoading(false);
      return;
    }

    // Assign participant_id based on class — collision-safe
    const prefix = CLASS_PREFIXES[form.class_id] || "PX";

    // Fetch ALL participants with this prefix to find the true max number used
    const allParticipants = await base44.entities.Participant.list();
    const usedNums = allParticipants
      .map(p => p.participant_id)
      .filter(pid => pid && pid.startsWith(prefix))
      .map(pid => parseInt(pid.slice(prefix.length), 10))
      .filter(n => !isNaN(n));
    const maxNum = usedNums.length > 0 ? Math.max(...usedNums) : 0;
    const nextNum = maxNum + 1;
    const participantId = `${prefix}${String(nextNum).padStart(3, "0")}`;

    // Double-check the generated ID is not already taken (extra safety)
    const conflict = await base44.entities.Participant.filter({ participant_id: participantId });
    if (conflict.length > 0) {
      setError("系統偵測到編號衝突，請稍後再試或聯絡老師。");
      setLoading(false);
      return;
    }

    const participant = await base44.entities.Participant.create({
      participant_id: participantId,
      name: form.name.trim(),
      student_id: form.student_id.trim(),
      password: form.password.trim(),
      class_id: form.class_id,
      gender: form.gender,
      years_experience: form.years_experience,
      group: CLASS_GROUP[form.class_id] || "AI_Pair",
      consent: form.consent,
      created_at: new Date().toISOString(),
    });

    registerRateLimit.record();
    sessionStorage.setItem("participant", JSON.stringify(participant));
    setLoading(false);
    setDone(participantId);
  };

  const glassBg = {
    background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)",
  };
  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.9) inset",
  };
  const inputStyle = {
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(0,0,0,0.12)",
    color: "#1d1d1f",
  };
  const focusHandlers = {
    onFocus: e => { e.target.style.border = "1px solid rgba(0,122,255,0.6)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,122,255,0.12)"; },
    onBlur: e => { e.target.style.border = "1px solid rgba(0,0,0,0.12)"; e.target.style.boxShadow = "none"; },
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={glassBg}>
        <div className="w-full max-w-sm rounded-3xl p-10 text-center" style={glassCard}>
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-semibold mb-1" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>註冊完成！</h2>
          <p className="text-sm mb-2" style={{ color: "#6e6e73" }}>你的參與者編號為：</p>
          <p className="text-3xl font-bold mb-6" style={{ color: "#007aff" }}>{done}</p>
          <p className="text-xs mb-6" style={{ color: "#aeaeb2" }}>請記住此編號，日後登入時需要使用。</p>
          <a
            href={createPageUrl("CheckIn")}
            className="block w-full py-2.5 rounded-xl font-semibold text-sm transition"
            style={{ background: "rgba(0,122,255,1)", color: "#fff", boxShadow: "0 2px 12px rgba(0,122,255,0.35)", letterSpacing: "-0.01em" }}
          >
            前往 Check-in →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={glassBg}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,199,89,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>

      <div className="relative w-full max-w-md rounded-3xl p-8" style={{ ...glassCard, zIndex: 1 }}>
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>參與者註冊</h1>
        <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>填寫以下資料以完成研究註冊，系統將自動配發參與者編號。</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: "姓名 *", key: "name", type: "text", placeholder: "請輸入真實姓名", maxLength: 20, transform: v => v.slice(0, 20) },
            { label: "學號 *", key: "student_id", type: "text", placeholder: "請輸入學號", maxLength: 20, transform: v => v.toUpperCase().slice(0, 20) },
            { label: "密碼 *", key: "password", type: "password", placeholder: "請設定登入密碼", maxLength: 50, transform: v => v.slice(0, 50) },
          ].map(({ label, key, type, placeholder, maxLength, transform }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#6e6e73" }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => set(key, transform(e.target.value))}
                maxLength={maxLength}
                placeholder={placeholder}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
                style={inputStyle}
                {...focusHandlers}
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#6e6e73" }}>班級 *</label>
            <select
              value={form.class_id}
              onChange={e => set("class_id", e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
              style={inputStyle}
            >
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#6e6e73" }}>性別 *</label>
            <select
              value={form.gender}
              onChange={e => set("gender", e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
              style={inputStyle}
            >
              {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#6e6e73" }}>
              學習程式設計年資：<span style={{ color: "#007aff", fontWeight: 600 }}>{form.years_experience} 年</span>
            </label>
            <select
              value={form.years_experience}
              onChange={e => set("years_experience", Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
              style={inputStyle}
            >
              {EXPERIENCE_OPTIONS.map(v => (
                <option key={v} value={v}>{v === 0 ? "無經驗" : `${v} 年`}</option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
            <input
              type="checkbox"
              id="consent"
              checked={form.consent}
              onChange={e => set("consent", e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-500"
            />
            <label htmlFor="consent" className="text-sm" style={{ color: "#3a3a3c" }}>
              我同意參與此課程，並允許我的資料被用於學術研究用途。
            </label>
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-xl" style={{ background: "rgba(255,59,48,0.08)", color: "#ff3b30", border: "1px solid rgba(255,59,48,0.15)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: loading ? "rgba(52,199,89,0.5)" : "rgba(52,199,89,1)",
              color: "#fff",
              boxShadow: loading ? "none" : "0 2px 12px rgba(52,199,89,0.35)",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? "處理中…" : "完成註冊 →"}
          </button>
        </form>

        <p className="text-center mt-5" style={{ fontSize: "12px", color: "#aeaeb2" }}>
          已有帳號？ <a href={createPageUrl("CheckIn")} style={{ color: "#007aff" }} className="hover:underline">前往 Check-in</a>
        </p>
      </div>
    </div>
  );
}