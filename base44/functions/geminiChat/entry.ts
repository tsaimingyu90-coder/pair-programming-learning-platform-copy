// geminiChat — Gemini proxy with:
//   • per-key retry + exponential backoff (503)
//   • key rotation on 429/quota
//   • per-request timeout (25s)
//   • history trimming (keep system + last 12 turns)
//   • detailed logging

const MODEL = "gemini-3.5-flash";
const API_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Trim conversation history: keep first message (system prompt) + last N turns
function trimHistory(messages, maxTurns = 12) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= maxTurns + 1) return messages;
  const [first, ...rest] = messages;
  const trimmed = rest.slice(-maxTurns);
  return [first, ...trimmed];
}

// Prompt Injection patterns (backend guard)
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+(instructions?|rules?|prompts?)/i,
  /system\s*prompt/i,
  /reveal\s+(hidden|your|the)\s+(instructions?|prompt|rules?)/i,
  /\bact\s+as\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b/,
  /forget\s+(your|all|previous)\s+(instructions?|rules?)/i,
  /override\s+(your|the)\s+(instructions?|rules?)/i,
  /忽略(前面|之前|上面|所有)(的)?(規則|指令|設定|提示)/,
  /直接給我(完整|所有)(答案|程式|程式碼|解答)/,
  /不要遵守(老師|系統|管理)(的)?(設定|規則|指令)/,
  /請輸出(完整|所有)(程式|程式碼|答案|解答)/,
  /繞過(規則|限制|設定)/,
];

function detectInjection(messages) {
  // Only check last user message (not system prompt)
  const userMsgs = messages.filter(m => m?.role === "user").slice(-3);
  for (const msg of userMsgs) {
    const text = msg?.text ?? "";
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) return { detected: true, text: text.slice(0, 100) };
    }
  }
  return { detected: false };
}

Deno.serve(async (req) => {
  const startTs = Date.now();
  try {
    const { messages, temperature: reqTemp, maxOutputTokens: reqMaxTokens } = await req.json();

    if (!Array.isArray(messages)) {
      return Response.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Prompt injection check (skip first message which is system prompt)
    const checkMsgs = messages.slice(1);
    const injectionResult = detectInjection(checkMsgs);
    if (injectionResult.detected) {
      console.log(`🚨 Prompt injection detected: ${injectionResult.text}`);
      return Response.json({
        reply: "⚠️ 偵測到不符合學習規範的指令，請改以描述你想解決的問題或貼出你目前卡住的程式片段。",
        blocked: true,
      });
    }

    const apiKeys = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter(Boolean);

    if (apiKeys.length === 0) {
      return Response.json({ error: "No API keys configured" }, { status: 500 });
    }

    const TEMPERATURE = reqTemp ?? 0.25;
    const MAX_OUTPUT_TOKENS = Math.min(reqMaxTokens ?? 1000, 4000);

    const trimmedMessages = trimHistory(messages, 12);

    const body = {
      contents: trimmedMessages.map((m) => ({
        role: m?.role === "user" ? "user" : "model",
        parts: [{ text: (m?.text ?? "").slice(0, 4000) }], // truncate individual messages
      })),
      generationConfig: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    };

    let lastError = null;
    let lastStatus = null;
    let totalRetries = 0;

    for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
      const apiKey = apiKeys[keyIdx];
      const maxRetries = 2; // per key for 503

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
          console.log(`⏳ Key ${keyIdx + 1} retry ${attempt} after ${backoff}ms`);
          await sleep(backoff);
          totalRetries++;
        }

        try {
          console.log(`🔑 Key #${keyIdx + 1} attempt ${attempt + 1}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);

          let res, data;
          try {
            res = await fetch(API_URL(apiKey), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            data = await res.json();
          } finally {
            clearTimeout(timeoutId);
          }

          const duration = Date.now() - startTs;
          console.log(`📡 Key ${keyIdx + 1} status: ${res.status} | ${duration}ms | retries: ${totalRetries}`);

          if (res.ok) {
            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "（無回應）";
            const tokensIn = data?.usageMetadata?.promptTokenCount ?? null;
            const tokensOut = data?.usageMetadata?.candidatesTokenCount ?? null;
            console.log(`✅ OK | tokens in:${tokensIn} out:${tokensOut} | ${duration}ms`);
            return Response.json({
              reply,
              apiKeyIndex: keyIdx + 1,
              model: MODEL,
              temperature: TEMPERATURE,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              retries: totalRetries,
              duration_ms: duration,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
            });
          }

          lastError = data?.error?.message || "Unknown error";
          lastStatus = res.status;

          // 429 or quota → switch to next key immediately
          if (
            res.status === 429 ||
            lastError?.toLowerCase().includes("quota") ||
            lastError?.toLowerCase().includes("rate")
          ) {
            console.log(`⚠️ 429/quota on key ${keyIdx + 1} → next key`);
            await sleep(500); // small delay before switching
            break; // break inner retry loop, move to next key
          }

          // 503 → retry same key with backoff
          if (res.status === 503) {
            console.log(`⚠️ 503 on key ${keyIdx + 1}, attempt ${attempt + 1}`);
            if (attempt < maxRetries) continue;
            break; // exhausted retries for this key → next key
          }

          // 404 → log and return immediately (config error, no retry)
          if (res.status === 404) {
            console.log(`❌ 404 NotFound on key ${keyIdx + 1} — check model/endpoint. Error: ${lastError}`);
            return Response.json({ error: lastError, errorCode: 404 }, { status: 404 });
          }

          // Other errors → return immediately
          return Response.json({ error: lastError, errorCode: res.status }, { status: res.status });

        } catch (e) {
          lastError = e?.name === "AbortError" ? "Request timeout (25s)" : e?.message;
          lastStatus = e?.name === "AbortError" ? 408 : 500;
          console.log(`❌ Key ${keyIdx + 1} exception: ${lastError}`);
          if (attempt < maxRetries && e?.name !== "AbortError") continue;
          break;
        }
      }
    }

    const duration = Date.now() - startTs;
    console.log(`💥 All keys failed | ${duration}ms | retries: ${totalRetries} | lastStatus: ${lastStatus}`);
    return Response.json(
      { error: lastError || "All API keys failed", errorCode: lastStatus, retries: totalRetries },
      { status: lastStatus || 500 }
    );

  } catch (error) {
    console.log("🔥 outer error:", error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});