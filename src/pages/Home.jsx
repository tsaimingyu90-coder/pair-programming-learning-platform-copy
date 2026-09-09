import { createPageUrl } from "@/utils";

export default function Home() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)" }}
    >
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>

      <div
        className="relative w-full max-w-sm rounded-3xl p-10 text-center"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.9) inset",
          zIndex: 1,
        }}
      >
        <img
          src="https://media.base44.com/images/public/69a421aebf4ec376458b1869/a621204e9_pAIr_mac_style_highres_icon_4096.png"
          alt="pAIr programming icon"
          className="mx-auto mb-5"
          style={{ width: 72, height: 72, borderRadius: 18, boxShadow: "0 4px 20px rgba(99,102,241,0.25)" }}
        />
        <h1 className="text-2xl font-semibold mb-8" style={{ color: "#1d1d1f", letterSpacing: "-0.02em" }}>程式設計實習學習平台</h1>

        <a
          href={createPageUrl("CheckIn")}
          className="block w-full py-2.5 rounded-xl font-semibold text-sm transition mb-3"
          style={{
            background: "rgba(0,122,255,1)",
            color: "#fff",
            boxShadow: "0 2px 12px rgba(0,122,255,0.35)",
            letterSpacing: "-0.01em",
          }}
        >
          登入（已有帳號）
        </a>
        <a
          href={createPageUrl("Register")}
          className="block w-full py-2.5 rounded-xl font-semibold text-sm transition"
          style={{
            background: "rgba(52,199,89,1)",
            color: "#fff",
            boxShadow: "0 2px 12px rgba(52,199,89,0.30)",
            letterSpacing: "-0.01em",
          }}
        >
          新生註冊 →
        </a>
      </div>
    </div>
  );
}