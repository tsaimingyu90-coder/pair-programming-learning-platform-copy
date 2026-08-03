import { useState, useEffect } from "react";

const TEACHER_USERNAME = "admin_mmn";
const TEACHER_PASSWORD = "mmn";
const STORAGE_KEY = "teacher_auth_token";

function getAuth() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "authenticated";
  } catch {
    return false;
  }
}

function setAuth() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "authenticated");
  } catch {}
}

export function useTeacherAuth() {
  const [authed, setAuthed] = useState(getAuth());
  const login = () => { setAuth(); setAuthed(true); };
  const logout = () => { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} setAuthed(false); };
  return { authed, login, logout };
}

export default function TeacherAuthGuard({ children }) {
  const { authed, login } = useTeacherAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  if (authed) return children;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === TEACHER_USERNAME && password === TEACHER_PASSWORD) {
      login();
    } else {
      setError("帳號或密碼錯誤，請重試");
    }
  };

  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    border: "1px solid rgba(255,255,255,0.55)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.10), 0 1.5px 8px rgba(0,0,0,0.06)",
    borderRadius: "24px",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: "12px",
    fontSize: "14px",
    color: "#1c1c1e",
    outline: "none",
    transition: "border 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #e8f0fe 0%, #f0f4ff 40%, #fce4ec 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient blobs */}
      <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", background: "rgba(99,102,241,0.12)", filter: "blur(60px)", top: "10%", left: "15%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: "rgba(236,72,153,0.10)", filter: "blur(50px)", bottom: "12%", right: "12%", pointerEvents: "none" }} />

      <div style={{ ...glassCard, width: "100%", maxWidth: 380, padding: "40px 36px" }}>
        {/* Icon */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56,
            background: "linear-gradient(135deg, #6366f1, #818cf8)",
            borderRadius: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 4px 16px rgba(99,102,241,0.30)",
          }}>
            <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1c1e", margin: 0 }}>教師登入</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>pAIr programming 學習平台</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>帳號</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              placeholder="輸入帳號"
              autoComplete="username"
              style={inputStyle}
              onFocus={e => e.target.style.border = "1px solid rgba(99,102,241,0.55)"}
              onBlur={e => e.target.style.border = "1px solid rgba(0,0,0,0.10)"}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>密碼</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="輸入密碼"
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={e => e.target.style.border = "1px solid rgba(99,102,241,0.55)"}
                onBlur={e => e.target.style.border = "1px solid rgba(0,0,0,0.10)"}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}
              >
                {showPw ? (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#dc2626", textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "11px 0",
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
              marginTop: 4,
              transition: "opacity 0.2s",
            }}
            onMouseOver={e => e.currentTarget.style.opacity = "0.88"}
            onMouseOut={e => e.currentTarget.style.opacity = "1"}
          >
            登入
          </button>
        </form>
      </div>
    </div>
  );
}