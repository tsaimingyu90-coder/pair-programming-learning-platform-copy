Deno.serve(async (req) => {
  try {
    const { code, stdin = "" } = await req.json();

    const apiKeys = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter(Boolean);

    if (apiKeys.length === 0) {
      return Response.json({ stdout: "", stderr: "GEMINI_API_KEY not set" });
    }

    const stdinSection = stdin.trim()
      ? `\n程式的標準輸入（stdin）為：\n\`\`\`\n${stdin}\n\`\`\``
      : "\n（此程式無標準輸入）";

    const prompt = `你是一個精確的 C 語言執行環境。請逐步模擬執行以下 C 程式碼，只回傳程式的實際標準輸出（stdout）結果，不要有任何解釋或多餘文字。
規則：
- system("pause") 或 system("cls") 等系統呼叫請忽略，不產生任何輸出。
- scanf/gets/fgets 等輸入函式請使用提供的 stdin 資料依序讀取。
- %c 格式字符請正確輸出對應的 ASCII 字符（例如 scanf 讀到整數 90，printf("%c", num) 應輸出 'Z'）。
- 如果程式有編譯錯誤，回傳 "COMPILE_ERROR:" 後面接錯誤訊息。
- 如果程式執行時有錯誤，回傳 "RUNTIME_ERROR:" 後面接錯誤訊息。
${stdinSection}

程式碼：
\`\`\`c
${code}
\`\`\`

只回傳 stdout 輸出結果，不要有任何多餘說明。`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
    };

    // Try multiple models in case one is unavailable
    const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];
    let lastErr = "";
    for (const model of MODELS) {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        let res, data;
        try {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            }
          );
          data = await res.json();
        } finally {
          clearTimeout(timeoutId);
        }

        if (res.status === 429 || res.status === 503) {
          lastErr = `HTTP ${res.status}`;
          console.log(`Key ${i+1} model ${model} got ${res.status}, trying next`);
          continue;
        }

        if (!res.ok) {
          const msg = data?.error?.message || `HTTP ${res.status}`;
          console.log(`Key ${i+1} model ${model} error: ${msg}`);
          lastErr = msg;
          if (res.status === 404) {
            lastErr = `模型不可用 (404): ${msg}`;
            break; // break key loop, try next model
          }
          return Response.json({ stdout: "", stderr: `API error: ${msg}` });
        }

        const output = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (output.startsWith("COMPILE_ERROR:")) {
          return Response.json({ stdout: "", stderr: output.replace("COMPILE_ERROR:", "").trim() });
        }
        if (output.startsWith("RUNTIME_ERROR:")) {
          return Response.json({ stdout: "", stderr: output.replace("RUNTIME_ERROR:", "").trim() });
        }

        return Response.json({ stdout: output, stderr: "" });

      } catch (e) {
        lastErr = e?.name === "AbortError" ? "執行逾時（20秒）" : e?.message;
        console.log(`Key ${i+1} exception: ${lastErr}`);
        if (i < apiKeys.length - 1) continue;
      }
    } // end key loop
    } // end model loop

    return Response.json({ stdout: "", stderr: lastErr || "所有 API Key 均失敗" });
  } catch (error) {
    return Response.json({ stdout: "", stderr: error.message }, { status: 500 });
  }
});