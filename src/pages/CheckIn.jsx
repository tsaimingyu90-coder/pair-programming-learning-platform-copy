import { useState, useRef } from "react";
import { perfStart, logPerf } from "@/hooks/usePerf";
import { useRateLimit } from "@/hooks/useRateLimit";
import { logSecurityEvent } from "@/utils/securityGuard";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

const LOGIN_MODES = [
  { key: "participant_id", label: "參與者編號", placeholder: "例如：PA001" },
  { key: "name", label: "姓名", placeholder: "請輸入真實姓名" },
  { key: "student_id", label: "學號", placeholder: "請輸入學號" },
];

export default function CheckIn() {
  const [mode, setMode] = useState("participant_id");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginStatus, setLoginStatus] = useState(""); // 狀態文字
  const [loginSuccess, setLoginSuccess] = useState(false);
  const loginTimerRef = useRef(null);
  const loginRateLimit = useRateLimit("checkin_login", 5, 60000);

  const currentMode = LOGIN_MODES.find(m => m.key === mode);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (loginRateLimit.isBlocked()) {
      logSecurityEvent({ page: "CheckIn", event_type: "repeated_login_attempt", risk_level: "high", message: "Login rate limit hit" });
      return setError(`嘗試次數過多，請稍後再試（還需 ${loginRateLimit.getWaitSeconds()} 秒）。`);
    }
    if (!identifier.trim()) return setError(`請輸入${currentMode.label}。`);
    if (!password.trim()) return setError("請輸入密碼。");
    loginRateLimit.record();
    setLoading(true);
    const _loginT0 = perfStart();
    setLoginStatus("正在驗證帳號...");

    // Show slow-network warning after 4s
    loginTimerRef.current = setTimeout(() => {
      setLoginStatus("網路較慢，請稍候...");
    }, 4000);
    // Timeout warning after 8s
    const timeoutTimer = setTimeout(() => {
      setLoginStatus("連線逾時，請確認網路後再試");
    }, 8000);

    const t0 = Date.now();
    let existing;
    try {
      existing = await Promise.race([
        base44.entities.Participant.filter({ [mode]: identifier.trim() }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000))
      ]);
      logPerf({ event: "participant_query", page: "CheckIn", duration: Date.now() - t0, status: "success", meta: { count: existing.length } });
    } catch (err) {
      clearTimeout(loginTimerRef.current);
      clearTimeout(timeoutTimer);
      logPerf({ event: "participant_query", page: "CheckIn", duration: Date.now() - t0, status: err.message === "timeout" ? "timeout" : "error" });
      setError(err.message === "timeout" ? "網路連線逾時，請確認網路後重試。" : "查詢失敗，請重試。");
      setLoading(false);
      setLoginStatus("");
      return;
    }
    clearTimeout(loginTimerRef.current);
    clearTimeout(timeoutTimer);

    if (existing.length === 0) {
      setError(`找不到此${currentMode.label}，請確認後重試或前往註冊。`);
      setLoading(false);
      setLoginStatus("");
      return;
    }
    const participant = existing[0];
    if (participant.password && participant.password !== password.trim()) {
      logSecurityEvent({ page: "CheckIn", participant_id: participant?.participant_id, event_type: "repeated_login_attempt", risk_level: "medium", message: `Wrong password attempt` });
      logPerf({ event: "login_error", page: "CheckIn", duration: Date.now() - _loginT0, status: "error", meta: { reason: "wrong_password" } });
      setError("密碼錯誤，請重試。");
      setLoading(false);
      setLoginStatus("");
      return;
    }
    console.log("[CheckIn] login success", participant.participant_id);
    logPerf({ event: "login_success", page: "CheckIn", duration: Date.now() - _loginT0, status: "success", participant_id: participant.participant_id });
    sessionStorage.setItem("participant", JSON.stringify(participant));
    setLoading(false);
    setLoginSuccess(true);

    // Animated status messages while preloading
    const steps = [
      "登入資料正確 ✓",
      "正在載入任務清單...",
      "正在讀取作答紀錄...",
      "正在檢查開放狀態...",
      "即將進入任務選單...",
    ];
    let stepIndex = 0;
    setLoginStatus(steps[stepIndex]);
    const stepTimer = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, steps.length - 1);
      setLoginStatus(steps[stepIndex]);
    }, 700);

    console.log("[CheckIn] preloading WeekSelection data...");
    try {
      await Promise.all([
        base44.entities.Assignment.list(),
        base44.entities.Attempt.filter({ participant: participant.id }, '-updated_date', 200),
        participant?.class_id ? base44.entities.AssignmentAvailability.filter({ class_id: participant.class_id }) : Promise.resolve([]),
      ]);
    } catch {}

    clearInterval(stepTimer);
    setLoginStatus("任務選單已就緒，正在跳轉...");
    console.log("[CheckIn] redirect to WeekSelection");
    setTimeout(() => { window.location.href = createPageUrl("WeekSelection"); }, 400);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}
    >
      {/* Glass card */}
      <div
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.9) inset",
        }}
      >
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>登入</h1>
        <p className="text-sm mb-6" style={{ color: "#6e6e73" }}>選擇登入方式並輸入密碼以登入。</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode selector */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "#6e6e73", letterSpacing: "0.02em" }}>登入方式</label>
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: "rgba(0,0,0,0.05)" }}
            >
              {LOGIN_MODES.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { setMode(m.key); setIdentifier(""); setError(""); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={mode === m.key ? {
                    background: "rgba(255,255,255,0.95)",
                    color: "#1d1d1f",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                  } : {
                    background: "transparent",
                    color: "#6e6e73",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Identifier input */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#6e6e73" }}>{currentMode.label}</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(mode === 'student_id' ? e.target.value.toUpperCase() : e.target.value)}
              maxLength={mode === 'participant_id' ? 10 : mode === 'student_id' ? 20 : 30}
              placeholder={currentMode.placeholder}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#1d1d1f",
              }}
              onFocus={e => { e.target.style.border = "1px solid rgba(0,122,255,0.6)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,122,255,0.12)"; }}
              onBlur={e => { e.target.style.border = "1px solid rgba(0,0,0,0.12)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Password input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: "#6e6e73" }}>密碼</label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ color: "#6e6e73", fontSize: "11px" }}>
                <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} className="w-3 h-3 accent-blue-500" />
                顯示密碼
              </label>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              maxLength={50}
              placeholder="請輸入密碼"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#1d1d1f",
              }}
              onFocus={e => { e.target.style.border = "1px solid rgba(0,122,255,0.6)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,122,255,0.12)"; }}
              onBlur={e => { e.target.style.border = "1px solid rgba(0,0,0,0.12)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Status / Error */}
          {loginStatus && !error && (
            <p className="text-sm flex items-center gap-2" style={{ color: loginSuccess ? "#34c759" : "#ff9500" }}>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: loginSuccess ? "#34c759" : "#ff9500",
                  animation: loginSuccess ? "none" : "pulse 1.2s infinite",
                }}
              />
              {loginStatus}
            </p>
          )}
          {error && (
            <p
              className="text-sm px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,59,48,0.08)", color: "#ff3b30", border: "1px solid rgba(255,59,48,0.15)" }}
            >
              {error}
            </p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: loading ? "rgba(0,122,255,0.5)" : "rgba(0,122,255,1)",
              color: "#fff",
              boxShadow: loading ? "none" : "0 2px 12px rgba(0,122,255,0.35)",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? loginStatus || "登入中…" : "登入"}
          </button>
        </form>

        <p className="text-center mt-5" style={{ fontSize: "12px", color: "#aeaeb2" }}>
          還沒有帳號？{" "}
          <a href={createPageUrl("Register")} style={{ color: "#007aff" }} className="hover:underline">前往註冊</a>
        </p>
      </div>
    </div>
  );
}