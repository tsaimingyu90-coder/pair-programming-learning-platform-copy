import { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { LanguageSelector, getHighlightedLines } from "@/components/SyntaxHighlighter";

const DEFAULT_CODE = `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`;

const INITIAL_CODE = DEFAULT_CODE;

const NEEDS_INPUT_PATTERN = /\b(scanf|gets|fgets|getchar|getc|fscanf)\s*\(/;

function extractPrompts(code) {
  const firstInput = code.search(/\b(scanf|fgets|gets|getchar|getc)\s*\(/);
  const relevantCode = firstInput >= 0 ? code.slice(0, firstInput) : code;
  const prompts = [];
  const printfRe = /\bprintf\s*\(\s*"((?:[^"\\]|\\.)*)"/g;
  const putsRe = /\bputs\s*\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = printfRe.exec(relevantCode)) !== null) {
    const s = m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    if (s.trim()) prompts.push(s);
  }
  while ((m = putsRe.exec(relevantCode)) !== null) {
    const s = m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (s.trim()) prompts.push(s);
  }
  return prompts.join('');
}

export default function CCompiler({ initialCode }) {
  const [code, setCode] = useState(initialCode || DEFAULT_CODE);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [waitingInput, setWaitingInput] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const [promptText, setPromptText] = useState("");
  const [language, setLanguage] = useState('c');
  const [theme, setTheme] = useState('light');
  const textareaRef = useRef(null);
  const highlightOverlayRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('ccompiler-language');
    if (saved) setLanguage(saved);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ccompiler-theme');
    if (saved) setTheme(saved);
  }, []);

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    localStorage.setItem('ccompiler-language', newLang);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('ccompiler-theme', newTheme);
  };

  const lines = code.split("\n");
  const highlightedLines = useMemo(() => getHighlightedLines(code, language), [code, language]);

  const execute = async (stdin = "") => {
    setRunning(true);
    setOutput("");
    setError("");
    setWaitingInput(false);
    setStdinValue("");
    try {
      const res = await base44.functions.invoke("runCode", { code, stdin });
      const data = res?.data ?? {};
      if (data?.error) {
        setError("執行失敗：" + data.error);
      } else {
        const { stdout = "", stderr = "" } = data;
        if (stderr) setError(stderr);
        else {
          setOutput(stdout || "（無輸出）");
        }
      }
    } catch (e) {
      setError("執行失敗：" + (e?.message || "請檢查網路連線。"));
    } finally {
      setRunning(false);
    }
  };

  const handleRun = () => {
    if (NEEDS_INPUT_PATTERN.test(code)) {
      setWaitingInput(true);
      setOutput("");
      setError("");
      setStdinValue("");
      setPromptText(extractPrompts(code));
    } else {
      execute();
    }
  };

  const lightTheme = theme === 'light';
  const containerBg = lightTheme ? '#ffffff' : '#1e1e1e';
  const containerBorder = lightTheme ? '#d0d0d0' : '#3c3c3c';
  const titleBarBg = lightTheme ? '#f5f5f5' : '#2d2d2d';
  const editorBg = lightTheme ? '#ffffff' : '#1e1e1e';
  const editorLineNumColor = lightTheme ? '#999999' : '#858585';
  const editorTextColor = lightTheme ? '#1e1e1e' : '#d4d4d4';
  const editorCaretColor = lightTheme ? '#333333' : '#d4d4d4';
  const outputBg = lightTheme ? '#f5f5f5' : '#0c0c0c';
  const outputTextColor = lightTheme ? '#333333' : '#cccccc';
  const buttonBg = lightTheme ? '#e0e0e0' : '#3c3c3c';
  const buttonTextColor = lightTheme ? '#333333' : '#ccc';

  return (
    <div className="w-full rounded overflow-hidden flex flex-col" style={{ height: "500px", background: containerBg, border: `1px solid ${containerBorder}`, fontFamily: "'Courier New', Consolas, monospace" }}>

      {/* Title bar */}
      <div className="flex items-center justify-between px-3" style={{ background: titleBarBg, borderBottom: `1px solid ${containerBorder}`, minHeight: "44px", gap: "8px" }}>
        {/* Tab */}
        <div className="flex items-center flex-shrink-0">
          <div className="px-3 py-2 text-sm whitespace-nowrap" style={{ background: editorBg, color: editorTextColor, borderRight: `1px solid ${containerBorder}`, borderBottom: "2px solid #0e639c" }}>
            main.c
          </div>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end" style={{ minWidth: 0 }}>
          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="h-8 px-2 text-xs rounded border transition cursor-pointer flex-shrink-0"
            style={{ background: editorBg, color: editorTextColor, borderColor: containerBorder }}
            title="選擇語言"
          >
            {[{ value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' }, { value: 'javascript', label: 'JS' }, { value: 'python', label: 'Python' }, { value: 'text', label: 'Text' }].map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {/* Theme selector */}
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="h-8 px-2 text-xs rounded border transition cursor-pointer flex-shrink-0"
            style={{ background: editorBg, color: editorTextColor, borderColor: containerBorder }}
            title="選擇主題"
          >
            <option value="light">淺色</option>
            <option value="dark">深色</option>
          </select>
          {/* Reset button */}
          <button
            onClick={() => { setCode(initialCode || DEFAULT_CODE); setOutput(""); setError(""); setWaitingInput(false); }}
            title="復原預設程式碼"
            className="h-8 flex items-center gap-1 px-2.5 text-xs rounded border transition flex-shrink-0"
            style={{ background: buttonBg, color: buttonTextColor, borderColor: containerBorder }}
          >
            <span>↩</span><span className="hidden sm:inline">復原</span>
          </button>
          {/* Stop button */}
          <button
            onClick={() => { setRunning(false); setWaitingInput(false); setOutput(""); setError(""); }}
            disabled={!running && !waitingInput}
            title="停止執行"
            className="h-8 flex items-center gap-1 px-2.5 text-xs rounded border transition flex-shrink-0 disabled:opacity-30"
            style={{ background: buttonBg, color: "#f48771", borderColor: containerBorder }}
          >
            <span>■</span><span className="hidden sm:inline">停止</span>
          </button>
          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            className="h-8 flex items-center gap-1.5 px-3 text-xs font-bold rounded border-0 transition flex-shrink-0 disabled:opacity-50 whitespace-nowrap"
            style={{ background: running ? (lightTheme ? "#555" : "#555") : "#0e639c", color: "#fff" }}
          >
            {running ? (
              <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" /><span className="hidden sm:inline">執行中…</span></>
            ) : (
              <><span>▶</span><span className="hidden sm:inline">執行 (F9)</span></>
            )}
          </button>
        </div>
      </div>

      {/* Editor with line numbers */}
       <div className="flex flex-1 overflow-hidden relative">
         {/* Line numbers */}
         <div className="select-none text-right pr-3 pt-3 text-sm leading-6 overflow-hidden flex-shrink-0"
           style={{ background: editorBg, color: editorLineNumColor, minWidth: "40px", borderRight: `1px solid ${containerBorder}` }}>
           {lines.map((_, i) => (
             <div key={i} style={{ lineHeight: "24px" }}>{i + 1}</div>
           ))}
         </div>

         {/* Container for overlay and textarea - sync scroll */}
         <div className="flex-1 overflow-hidden relative">
           {/* Highlighted overlay */}
           <div
             ref={highlightOverlayRef}
             className="absolute inset-0 overflow-x-auto overflow-y-hidden pointer-events-none"
           >
             <pre className="text-sm pt-3 px-3 m-0"
               style={{ color: editorTextColor, lineHeight: "24px", whiteSpace: "pre", minWidth: "fit-content" }}>
               {highlightedLines.map((html, i) => (
                 <div key={i} dangerouslySetInnerHTML={{ __html: html || " " }} />
               ))}
             </pre>
           </div>

           {/* Actual textarea (transparent, for editing) */}
           <textarea
             ref={textareaRef}
             value={code}
             onChange={(e) => {
               setCode(e.target.value);
               if (highlightOverlayRef.current) {
                 highlightOverlayRef.current.scrollTop = e.target.scrollTop;
                 highlightOverlayRef.current.scrollLeft = e.target.scrollLeft;
               }
             }}
             onScroll={(e) => {
               if (highlightOverlayRef.current) {
                 highlightOverlayRef.current.scrollTop = e.target.scrollTop;
                 highlightOverlayRef.current.scrollLeft = e.target.scrollLeft;
               }
             }}
             spellCheck={false}
             className="absolute inset-0 text-sm p-3 resize-none outline-none overflow-auto"
             style={{
               background: "transparent",
               color: "transparent",
               caretColor: editorCaretColor,
               lineHeight: "24px",
               border: "none",
               fontFamily: "'Courier New', Consolas, monospace",
             }}
           />
         </div>
       </div>

      {/* Output terminal */}
      <div style={{ height: waitingInput ? "180px" : "130px", background: outputBg, borderTop: `1px solid ${containerBorder}`, transition: "height 0.2s" }}>
        <div className="px-3 py-1 flex items-center gap-4" style={{ background: titleBarBg, borderBottom: `1px solid ${containerBorder}` }}>
          <span className="text-sm" style={{ color: editorTextColor }}>📟 執行結果</span>
          {(output || error) && (
            <button onClick={() => { setOutput(""); setError(""); }}
              className="text-sm" style={{ color: editorLineNumColor }}>清除</button>
          )}
        </div>
        <div className="px-4 py-2 overflow-y-auto" style={{ height: "calc(100% - 28px)" }}>
          {running && <span className="text-sm animate-pulse" style={{ color: editorLineNumColor }}>編譯執行中…</span>}
          {waitingInput && !running && (
            <div>
              {promptText && (
                <pre className="text-sm whitespace-pre-wrap mb-2" style={{ color: outputTextColor }}>{promptText}</pre>
              )}
              <div className="flex gap-2 items-center">
                <input
                  autoFocus
                  value={stdinValue}
                  onChange={(e) => setStdinValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") execute(stdinValue); }}
                  placeholder="輸入資料後按 Enter 或點 ▶ 執行…"
                  className="flex-1 text-sm font-mono px-2 py-1 outline-none rounded"
                  style={{ background: editorBg, color: editorTextColor, border: `1px solid ${containerBorder}`, caretColor: editorCaretColor }}
                />
                <button
                  onClick={() => execute(stdinValue)}
                  className="px-3 py-1 text-sm font-bold rounded"
                  style={{ background: "#0e639c", color: "#fff" }}
                >▶</button>
                <button
                  onClick={() => setWaitingInput(false)}
                  className="px-2 py-1 text-sm rounded"
                  style={{ background: buttonBg, color: buttonTextColor }}
                >✕</button>
              </div>
            </div>
          )}
          {error && <pre className="text-sm whitespace-pre-wrap" style={{ color: "#f48771" }}>{error}</pre>}
          {!error && output && <pre className="text-sm whitespace-pre-wrap" style={{ color: outputTextColor }}>{output}</pre>}
          {!running && !waitingInput && !error && !output && <span className="text-sm" style={{ color: editorLineNumColor }}>尚無輸出</span>}
        </div>
      </div>

    </div>
  );
}