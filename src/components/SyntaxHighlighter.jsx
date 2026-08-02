// 統一的語法高亮邏輯與語言定義
export const LANGUAGE_OPTIONS = [
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'text', label: 'Plain Text' },
];

const HIGHLIGHT_RULES = {
  c: [
    { re: /\/\/[^\n]*|(\/\*[\s\S]*?\*\/)/g, color: '#6a9955' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, color: '#ce9178' },
    { re: /^(\s*#\w+)/gm, color: '#c586c0' },
    { re: /\b(int|char|float|double|void|return|if|else|for|while|do|break|continue|switch|case|default|struct|typedef|include|define|printf|scanf|main)\b/g, color: '#569cd6' },
    { re: /\b(\d+(?:\.\d+)?)\b/g, color: '#b5cea8' },
  ],
  cpp: [
    { re: /\/\/[^\n]*|(\/\*[\s\S]*?\*\/)/g, color: '#6a9955' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, color: '#ce9178' },
    { re: /^(\s*#\w+)/gm, color: '#c586c0' },
    { re: /\b(int|char|float|double|void|return|if|else|for|while|do|break|continue|switch|case|default|struct|typedef|include|define|iostream|cout|cin|std|class|public|private|template)\b/g, color: '#569cd6' },
    { re: /\b(\d+(?:\.\d+)?)\b/g, color: '#b5cea8' },
  ],
  javascript: [
    { re: /\/\/[^\n]*|(\/\*[\s\S]*?\*\/)/g, color: '#6a9955' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, color: '#ce9178' },
    { re: /\b(function|return|if|else|for|while|do|break|continue|const|let|var|async|await|class|extends|import|export|default)\b/g, color: '#569cd6' },
    { re: /\b(true|false|null|undefined)\b/g, color: '#569cd6' },
    { re: /\b(\d+(?:\.\d+)?)\b/g, color: '#b5cea8' },
  ],
  python: [
    { re: /#[^\n]*/g, color: '#6a9955' },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, color: '#ce9178' },
    { re: /\b(def|class|if|elif|else|for|while|return|import|from|as|with|try|except|finally|raise|assert|break|continue|pass|lambda|yield|and|or|not|in|is)\b/g, color: '#569cd6' },
    { re: /\b(True|False|None)\b/g, color: '#569cd6' },
    { re: /\b(\d+(?:\.\d+)?)\b/g, color: '#b5cea8' },
  ],
  text: [],
};

function highlightLine(rawLine, language) {
  if (language === 'text' || !language) {
    return rawLine
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const line = rawLine.replace(/\t/g, '    ');
  const rules = HIGHLIGHT_RULES[language] || [];
  const tokens = [];

  for (const { re, color } of rules) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, text: m[0], color });
    }
  }

  tokens.sort((a, b) => a.start - b.start);
  const used = [];
  for (const t of tokens) {
    if (used.length === 0 || t.start >= used[used.length - 1].end) used.push(t);
  }

  let result = '';
  let cursor = 0;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const t of used) {
    result += esc(line.slice(cursor, t.start));
    result += `<span style="color:${t.color}">${esc(t.text)}</span>`;
    cursor = t.end;
  }
  result += esc(line.slice(cursor));
  return result;
}

export function getHighlightedLines(code, language) {
  return code.split('\n').map(line => highlightLine(line, language));
}

export function LanguageSelector({ value, onChange, className = '', theme = 'light' }) {
  const isDark = theme === 'dark';
  return (
    <select
      value={value || 'c'}
      onChange={(e) => onChange(e.target.value)}
      className={`px-2 py-1 text-xs rounded border transition cursor-pointer ${
        isDark
          ? 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
      } ${className}`}
      title="選擇程式碼語言以套用語法高亮"
    >
      {LANGUAGE_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}