import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const WEEKS = [1, 2, 3, 4, 5, 6];
const STORAGE_KEY = "attendance_class_week_dates";

export const PERIODS = [
  { num: 1, label: "第一節", time: "08:10~09:00" },
  { num: 2, label: "第二節", time: "09:10~10:00" },
  { num: 3, label: "第三節", time: "10:10~11:00" },
  { num: 4, label: "第四節", time: "11:10~12:00" },
  { num: 5, label: "第五節", time: "13:05~13:55" },
  { num: 6, label: "第六節", time: "14:05~14:55" },
  { num: 7, label: "第七節", time: "15:05~15:55" },
  { num: 8, label: "第八節", time: "16:05~16:55" },
];

// Load from localStorage (fast cache)
export const loadAllClassDates = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
};

export const saveAllClassDates = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

// Convert DB records array to allDates object format
const dbRecordsToAllDates = (records) => {
  const allDates = {};
  records.forEach(r => {
    if (!allDates[r.class_id]) allDates[r.class_id] = {};
    allDates[r.class_id][String(r.week_number)] = {
      date: r.date || "",
      periods: (r.periods || []).map(p => parseInt(p)),
    };
  });
  return allDates;
};

// Load from DB and update localStorage cache
export const loadAllClassDatesFromDB = async () => {
  try {
    const records = await base44.entities.ClassWeekDate.list();
    if (records.length === 0) return loadAllClassDates(); // fallback to localStorage
    const allDates = dbRecordsToAllDates(records);
    saveAllClassDates(allDates); // update cache
    return allDates;
  } catch {
    return loadAllClassDates(); // fallback
  }
};

export const getClassWeekDate = (allDates, classId, weekNum) => {
  const val = allDates?.[classId]?.[weekNum] ?? allDates?.[classId]?.[String(weekNum)];
  if (!val) return null;
  if (typeof val === "string") return val;
  return val.date || null;
};

export const getClassWeekPeriods = (allDates, classId, weekNum) => {
  const val = allDates?.[classId]?.[weekNum] ?? allDates?.[classId]?.[String(weekNum)];
  if (!val) return [];
  if (typeof val === "string") return [];
  return (val.periods || []).map(p => parseInt(p));
};

export const isCurrentWeek = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  const target = new Date(dateStr);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return target >= startOfWeek && target <= endOfWeek;
};

const getEntry = (allDates, cls, w) => {
  const val = allDates?.[cls]?.[w];
  if (!val) return { date: "", periods: [] };
  if (typeof val === "string") return { date: val, periods: [] };
  return { date: val.date || "", periods: val.periods || [] };
};

export default function ClassWeekDatesModal({ classes, onClose }) {
  const [allDates, setAllDates] = useState(loadAllClassDates);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDB, setLoadingDB] = useState(true);

  // Load from DB on open
  useEffect(() => {
    loadAllClassDatesFromDB().then(dates => {
      setAllDates(dates);
      setLoadingDB(false);
    });
  }, []);

  const handleDateChange = (cls, w, dateValue) => {
    setAllDates(prev => {
      const entry = getEntry(prev, cls, w);
      return {
        ...prev,
        [cls]: {
          ...(prev[cls] || {}),
          [w]: { date: dateValue, periods: entry.periods },
        }
      };
    });
  };

  const handlePeriodToggle = (cls, w, periodNum) => {
    setAllDates(prev => {
      const entry = getEntry(prev, cls, w);
      const periods = entry.periods.includes(periodNum)
        ? entry.periods.filter(p => p !== periodNum)
        : [...entry.periods, periodNum].sort((a, b) => a - b);
      return {
        ...prev,
        [cls]: {
          ...(prev[cls] || {}),
          [w]: { date: entry.date, periods },
        }
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Save to localStorage
    saveAllClassDates(allDates);

    // Save to DB: upsert each class+week entry
    const existingRecords = await base44.entities.ClassWeekDate.list();
    const existingMap = {};
    existingRecords.forEach(r => {
      existingMap[`${r.class_id}_${r.week_number}`] = r;
    });

    for (const cls of Object.keys(allDates)) {
      for (const w of WEEKS) {
        const entry = getEntry(allDates, cls, w);
        const key = `${cls}_${w}`;
        const existing = existingMap[key];
        if (existing) {
          await base44.entities.ClassWeekDate.update(existing.id, {
            date: entry.date,
            periods: entry.periods,
          });
        } else if (entry.date || entry.periods.length > 0) {
          await base44.entities.ClassWeekDate.create({
            class_id: cls,
            week_number: w,
            date: entry.date,
            periods: entry.periods,
          });
        }
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose(allDates);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onClose(allDates)}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900">📅 各班級上課日期設定</h2>
            <p className="text-xs text-gray-400 mt-0.5">設定每週上課日期及上課節次（儲存至資料庫）</p>
          </div>
          <button onClick={() => onClose(allDates)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-8">
          {loadingDB && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          {!loadingDB && classes.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">尚無班級資料</p>
          )}
          {!loadingDB && classes.map(cls => (
            <div key={cls}>
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs">{cls}</span>
              </h3>
              <div className="space-y-3">
                {WEEKS.map(w => {
                  const entry = getEntry(allDates, cls, w);
                  const isCurrent = isCurrentWeek(entry.date);
                  return (
                    <div key={w} className={`rounded-xl border p-3 ${isCurrent ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold w-6 flex-shrink-0 ${isCurrent ? "text-blue-700" : "text-gray-600"}`}>
                          W{w}
                        </span>
                        <input
                          type="date"
                          value={entry.date}
                          onChange={e => handleDateChange(cls, w, e.target.value)}
                          className={`text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 ${isCurrent ? "border-blue-300 bg-white" : "border-gray-300 bg-white"}`}
                        />
                        {isCurrent && (
                          <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">本週</span>
                        )}
                        {entry.periods.length > 0 && (
                          <span className="text-xs text-gray-500 ml-1">
                            已選 {entry.periods.length} 節：第 {entry.periods.join("、")} 節
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PERIODS.map(p => {
                          const checked = entry.periods.includes(p.num);
                          return (
                            <label
                              key={p.num}
                              className={`flex flex-col items-center justify-center px-1.5 py-1.5 rounded-lg border cursor-pointer transition select-none
                                ${checked
                                  ? "bg-blue-500 border-blue-600 text-white"
                                  : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:bg-blue-50"
                                }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => handlePeriodToggle(cls, w, p.num)}
                              />
                              <span className="text-xs font-bold leading-tight">{p.label}</span>
                              <span className={`text-xs leading-tight mt-0.5 ${checked ? "text-blue-100" : "text-gray-400"}`}>{p.time}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onClose(allDates)}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingDB}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${saved ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          >
            {saving ? "儲存中…" : saved ? "✅ 已儲存" : "💾 儲存設定"}
          </button>
        </div>
      </div>
    </div>
  );
}