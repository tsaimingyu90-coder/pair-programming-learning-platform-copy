import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function PromptPreviewModal({ prompt, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const chatEndRef = useRef(null);
  const geminiHistoryRef = useRef([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  const modelSettingsRef = useRef({});

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const init = async () => {
      // Load model settings for this role
      let temperature, maxOutputTokens;
      try {
        const data = await base44.entities.ModelSettings.filter({ role: prompt.role });
        if (data.length > 0) {
          temperature = data[0].temperature;
          maxOutputTokens = data[0].max_output_tokens;
          modelSettingsRef.current = { temperature, maxOutputTokens };
        }
      } catch {}

      const systemMsg = { role: "user", text: prompt.full_prompt };
      geminiHistoryRef.current = [systemMsg];
      setLoading(true);

      base44.functions.invoke("geminiChat", { messages: [systemMsg], temperature, maxOutputTokens })
        .then(res => {
          const reply = res?.data?.reply ?? "（無回應）";
          geminiHistoryRef.current = [systemMsg, { role: "model", text: reply }];
          setMessages([{ role: "model", text: reply }]);
          setLoading(false);
        })
        .catch(() => {
          setMessages([{ role: "model", text: "（發生錯誤，請重試）" }]);
          setLoading(false);
        });
    };
    init();
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: "user", text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const nextHistory = [...geminiHistoryRef.current, userMsg];
    geminiHistoryRef.current = nextHistory;

    try {
      const res = await base44.functions.invoke("geminiChat", { messages: nextHistory, ...modelSettingsRef.current });
      const reply = res?.data?.reply ?? "（無回應）";
      geminiHistoryRef.current = [...nextHistory, { role: "model", text: reply }];
      setMessages(prev => [...prev, { role: "model", text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "model", text: "（發生錯誤，請重試）" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ROLE_LABELS = { driver: "Driver（學生導航）", navigator: "Navigator（AI導航）", solo: "Solo 模式" };
  const ROLE_COLORS = {
    driver: "bg-indigo-100 text-indigo-700",
    navigator: "bg-amber-100 text-amber-700",
    solo: "bg-green-100 text-green-700",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl flex flex-col" style={{ height: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-base font-bold text-gray-900">預覽：{prompt.label}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[prompt.role] ?? "bg-gray-100 text-gray-500"}`}>
                {ROLE_LABELS[prompt.role] ?? prompt.role}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              正在使用此 Prompt 與 Gemini 測試對話
              {modelSettingsRef.current?.temperature != null && (
                <span className="ml-2 font-mono text-gray-400">· temp: {modelSettingsRef.current.temperature} · tokens: {modelSettingsRef.current.maxOutputTokens}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* System prompt preview */}
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer font-medium text-gray-600 hover:text-gray-800">查看 System Prompt 內容</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans bg-white rounded p-2 border border-gray-200 max-h-32 overflow-y-auto">
              {prompt.full_prompt}
            </pre>
          </details>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && messages.length === 0 && (
            <div className="mr-auto max-w-[90%] rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
              Gemini 初始化中...
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "ml-auto bg-slate-900 text-white"
                  : "mr-auto bg-gray-100 text-gray-800"
              }`}
            >
              {msg.text}
            </div>
          ))}
          {loading && messages.length > 0 && (
            <div className="mr-auto max-w-[90%] rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
              Gemini 回覆中...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-4 flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              placeholder="輸入測試訊息..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              送出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}