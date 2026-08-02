import { useState, useRef, useEffect } from "react";

/**
 * 下拉式多選核取方框元件
 * props:
 *   label        - 顯示標籤
 *   options      - string[]
 *   selected     - string[]
 *   onChange     - (newSelected: string[]) => void
 */
export default function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // 點外面關閉
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const displayText = selected.length === 0
    ? "全部"
    : selected.length === options.length
      ? "全部"
      : selected.join("、");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition min-w-[120px] justify-between"
      >
        <span className="text-gray-600 font-medium mr-1">{label}：</span>
        <span className={`truncate max-w-[140px] ${selected.length > 0 && selected.length < options.length ? "text-blue-600 font-semibold" : "text-gray-500"}`}>
          {displayText}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && options.length > 0 && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {/* 全選 / 清除 */}
          <button
            type="button"
            onClick={() => onChange(selected.length === options.length ? [] : [...options])}
            className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 font-medium border-b border-gray-100"
          >
            {selected.length === options.length ? "清除全選" : "全部選取"}
          </button>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}