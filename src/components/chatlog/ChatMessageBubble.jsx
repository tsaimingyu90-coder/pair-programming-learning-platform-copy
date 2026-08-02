import React from "react";
import ReactMarkdown from "react-markdown";

function getBubbleClass(log) {
  if (log.is_filtered) return "bg-red-50 text-red-800 border-red-200";
  if (log.is_system_prompt) return "bg-violet-50 text-violet-800 border-violet-200";
  if (log.role === "user") return "bg-slate-800 text-white border-transparent";
  return "bg-gray-100 text-gray-800 border-transparent";
}

function getTimeClass(log) {
  if (log.is_filtered) return "text-red-500";
  if (log.is_system_prompt) return "text-violet-400";
  if (log.role === "user") return "text-slate-400";
  return "text-gray-400";
}

function getTokenOutClass(tokOut, maxTok) {
  const limit = maxTok != null ? maxTok : 1000;
  return tokOut >= limit * 0.95 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";
}

export default function ChatMessageBubble({ log }) {
  const isNearLimit = log.tokens_out != null &&
    log.tokens_out >= (log.max_output_tokens != null ? log.max_output_tokens : 1000) * 0.95;

  return (
    <div className={log.role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm border ${log.role !== "model" ? "whitespace-pre-wrap" : ""} ${getBubbleClass(log)}`}>
        {log.is_system_prompt && log.display_content ? (
          <>
            <p className="text-xs font-semibold text-violet-500 mb-1">📱 顯示在對話框：</p>
            <p className="mb-2">{log.display_content}</p>
            <details className="mt-1">
              <summary className="text-xs font-semibold text-violet-500 cursor-pointer select-none">🤖 實際給 AI 的內容（展開）</summary>
              <p className="mt-1 text-xs text-violet-700 bg-violet-100 rounded-lg p-2 whitespace-pre-wrap">{log.content}</p>
            </details>
          </>
        ) : (
          <>
            {log.role === "model" ? (
              <ReactMarkdown
                className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:mt-2 prose-headings:mb-1 prose-strong:text-slate-900 prose-code:before:content-none prose-code:after:content-none"
                components={{
                  pre: ({ children, ...props }) => (
                    <pre className="bg-slate-100 text-slate-700 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono whitespace-pre-wrap" {...props}>
                      {children}
                    </pre>
                  ),
                  code: ({ node, inline, children, ...props }) => {
                    const isInline = !node?.position || inline !== false;
                    if (!isInline) return <code className="font-mono text-xs" {...props}>{children}</code>;
                    return <code className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>;
                  },
                }}
              >
                {log.content}
              </ReactMarkdown>
            ) : (
              <p>{log.content}</p>
            )}
            {log.is_filtered && log.raw_reply && (
              <details className="mt-2">
                <summary className="text-xs font-semibold text-red-600 cursor-pointer select-none">🚫 原始回覆（展開）</summary>
                <p className="mt-1 text-xs text-red-700 bg-red-100 rounded-lg p-2 whitespace-pre-wrap">{log.raw_reply}</p>
              </details>
            )}
          </>
        )}

        <p className={`text-xs mt-1 ${getTimeClass(log)}`}>
          {log.is_system_prompt ? "🤖 APP 提示" : log.role === "user" ? "學生" : "Gemini"} · {new Date(log.timestamp).toLocaleString("zh-TW")} {log.is_filtered && "· 🚫 已過濾"}
        </p>
        {log.role === "model" && (log.llm_model || log.temperature != null) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {log.llm_model && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">🧠 {log.llm_model}</span>}
            {log.temperature != null && <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 font-medium">🌡️ {log.temperature}</span>}
            {log.max_output_tokens != null && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-medium">📊 {log.max_output_tokens}</span>}
            {log.tokens_in != null && <span className="px-2 py-0.5 rounded-full text-xs bg-teal-100 text-teal-700 font-medium">↑{log.tokens_in}</span>}
            {log.tokens_out != null && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTokenOutClass(log.tokens_out, log.max_output_tokens)}`}>
                ↓{log.tokens_out}{isNearLimit ? " ⚠️" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}