import { useState, useEffect } from "react";
import { LanguageSelector, getHighlightedLines } from "@/components/SyntaxHighlighter";

export default function CodePreview({ code, className = "" }) {
  const [language, setLanguage] = useState('c');

  useEffect(() => {
    const saved = localStorage.getItem('codepreview-language');
    if (saved) setLanguage(saved);
  }, []);

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    localStorage.setItem('codepreview-language', newLang);
  };

  const highlightedLines = getHighlightedLines(code, language);
  const lineCount = code.split('\n').length;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-end">
        <LanguageSelector value={language} onChange={handleLanguageChange} />
      </div>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-gray-50 font-mono text-sm">
        {/* Line numbers */}
        <div
          className="select-none bg-gray-100 border-r border-gray-200 text-gray-400 text-right px-2 py-3 overflow-hidden"
          style={{ minWidth: "2.8rem", lineHeight: "1.5rem" }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ lineHeight: "1.5rem" }}>{i + 1}</div>
          ))}
        </div>
        {/* Highlighted code */}
        <pre className="flex-1 bg-transparent resize-none outline-none px-3 py-3 text-gray-800 whitespace-pre overflow-x-auto" style={{ lineHeight: "1.5rem", margin: 0 }}>
          {highlightedLines.map((html, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: html || " " }} />
          ))}
        </pre>
      </div>
    </div>
  );
}