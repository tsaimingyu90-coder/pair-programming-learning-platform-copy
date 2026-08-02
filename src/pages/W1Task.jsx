import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import GeminiInput from "@/components/GeminiInput";
import CCompiler from "@/components/CCompiler";

const ASSIGNMENT_ID = "A1";
const SESSION_ID = "W1";
const INTERVAL_SECS = 600; // 10 minutes per role swap

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function W1Task() {
  const [participant, setParticipant] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [session, setSession] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [phase, setPhase] = useState("pre"); // pre | task | done
  const [form, setForm] = useState({
    code_text: "",
    submit_type: "paste",
    ai_used: false,
    ai_minutes: "",
    difficulty: 4,
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(null);

  // Timer state
  const [totalSecs, setTotalSecs] = useState(0);
  const [intervalSecs, setIntervalSecs] = useState(0);
  const [rolePhase, setRolePhase] = useState(0); // 0 = participant=Navigator/AI=Driver, 1 = AI=Navigator/participant=Driver
  const timerRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const p = sessionStorage.getItem("participant");
    if (p) setParticipant(JSON.parse(p));

    const loadData = async () => {
      const [assignments, sessions] = await Promise.all([
      base44.entities.Assignment.filter({ assignment_id: ASSIGNMENT_ID }),
      base44.entities.Session.filter({ session_id: SESSION_ID })]
      );
      if (assignments.length > 0) setAssignment(assignments[0]);
      if (sessions.length > 0) setSession(sessions[0]);
    };
    loadData();
  }, []);

  // Start/stop timer when phase changes
  useEffect(() => {
    if (phase === "task") {
      timerRef.current = setInterval(() => {
        setTotalSecs((t) => t + 1);
        setIntervalSecs((i) => {
          if (i + 1 >= INTERVAL_SECS) {
            setRolePhase((r) => (r + 1) % 2);
            return 0;
          }
          return i + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleStart = async () => {
    if (!participant || !session || !assignment) return;
    setLoading(true);
    const a = await base44.entities.Attempt.create({
      participant: participant.id,
      session: session.id,
      assignment: assignment.id,
      start_ts: new Date().toISOString()
    });
    setAttempt(a);
    setTotalSecs(0);
    setIntervalSecs(0);
    setRolePhase(0);
    setPhase("task");
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!attempt) return;
    setLoading(true);
    const end = new Date();
    const start = new Date(attempt.start_ts);
    const mins = Math.round((end - start) / 60000);
    setDuration(mins);

    await base44.entities.Attempt.update(attempt.id, {
      end_ts: end.toISOString(),
      code_text: form.code_text,
      submit_type: form.submit_type,
      ai_used: form.ai_used,
      ai_minutes: form.ai_minutes ? Number(form.ai_minutes) : null,
      difficulty: Number(form.difficulty),
      notes: form.notes
    });
    setPhase("done");
    setLoading(false);
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const participantId = participant?.participant_id || "參與者";

  // Role panel info
  const roleInfo = rolePhase === 0 ?
  { navigator: participantId, driver: "AI" } :
  { navigator: "AI", driver: participantId };

  if (!participant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">No participant session found.</p>
          <a href={createPageUrl("CheckIn")} className="text-blue-600 underline text-sm">Go to Check-in</a>
        </div>
      </div>);

  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className={`mx-auto flex gap-4 ${phase === "task" ? "max-w-7xl" : "max-w-2xl"}`}>
        {/* Left: main content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">第一週任務</h1>
                <p className="text-sm text-gray-500">參與者：<span className="font-medium text-gray-700">{participant.participant_id}</span> · 隊伍：<span className="font-medium text-gray-700">{participant.group}</span></p>
              </div>
              <a href={createPageUrl("CheckIn")} className="text-xs text-gray-400 hover:text-gray-600">← Check-in</a>
            </div>
          </div>

          {/* Example Section */}
          {assignment &&
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">課堂範例</h2>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">程式1：</h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <pre className="text-sm text-gray-800 font-mono whitespace-pre overflow-x-auto">
{`#include <stdio.h>
#include <stdlib.h>
int main(void)
{
printf("Hello C!\\n");
printf("Hello World!\\n"); 
system("pause");
return 0;
}`}
                </pre>
              </div>
              
            </div>
          }

          {/* Assignment Prompt */}
          {assignment &&
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">課堂作業：{assignment.assignment_id}</h2>
              <h3 className="text-lg font-bold text-gray-900 mb-3">牛刀小試1</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 font-mono whitespace-pre-wrap border border-gray-200">
                請撰寫一程式，顯示"我愛C語言"。
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">提示</p>
                <p className="text-sm text-gray-600">使用print。</p>
              </div>
              <div className={`mt-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${assignment.allow_ai ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {assignment.allow_ai ? "✓ 可用AI" : "✗ 不可用AI"}
              </div>
            </div>
          }

          {/* Phase: pre */}
          {phase === "pre" &&
          <div className="text-center py-4">
              <button
              onClick={handleStart}
              disabled={loading || !assignment || !session}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition">
              
                {loading ? "啟動中…" : "▶ 開始任務"}
              </button>
              <p className="text-xs text-gray-400 mt-2">Timer starts when you click</p>
            </div>
          }

          {/* Phase: task */}
          {phase === "task" &&
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
              <h2 className="text-base font-bold text-gray-900 mb-3">線上 C 編譯器</h2>
              <p className="text-xs text-gray-400 mb-3">在下方編寫並執行你的 C 程式，完成後將程式碼貼到下面的作答區。</p>
              <CCompiler />
            </div>
          }

          {phase === "task" &&
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Submission</h2>
                <span className="text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full font-medium">● Timer running</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Code / Answer</label>
                  <textarea
                  value={form.code_text}
                  onChange={(e) => set("code_text", e.target.value)}
                  rows={8}
                  placeholder="Paste or type your solution here…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Submit Type</label>
                  <select
                  value={form.submit_type}
                  onChange={(e) => set("submit_type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  
                    <option value="paste">Paste</option>
                    <option value="upload">Upload</option>
                    <option value="link">Link</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <input
                  type="checkbox"
                  id="ai_used"
                  checked={form.ai_used}
                  onChange={(e) => set("ai_used", e.target.checked)}
                  className="w-4 h-4" />
                
                  <label htmlFor="ai_used" className="text-sm text-gray-700">I used AI assistance</label>
                </div>

                {form.ai_used &&
              <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AI usage (minutes)</label>
                    <input
                  type="number"
                  min="0"
                  value={form.ai_minutes}
                  onChange={(e) => set("ai_minutes", e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                
                  </div>
              }

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Perceived Difficulty: <span className="text-blue-600">{form.difficulty}</span> / 7
                  </label>
                  <input
                  type="range"
                  min="1" max="7" step="1"
                  value={form.difficulty}
                  onChange={(e) => set("difficulty", e.target.value)}
                  className="w-full" />
                
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1 Very Easy</span>
                    <span>7 Very Hard</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Any notes about your approach…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                
                </div>

                <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition">
                
                  {loading ? "Submitting…" : "✓ Submit Attempt"}
                </button>
              </form>
            </div>
          }

          {/* Phase: done */}
          {phase === "done" &&
          <div className="bg-white rounded-2xl border border-green-200 p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Submission Received</h2>
              <p className="text-gray-500 text-sm mb-4">
                Duration: <span className="font-semibold text-gray-800">{duration} minute{duration !== 1 ? "s" : ""}</span>
              </p>
              <a
              href={createPageUrl("SurveyPage")}
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              
                Continue to Survey →
              </a>
            </div>
          }
        </div>

        {/* Right: Role Panel — only visible during task */}
        {phase === "task" &&
        <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-blue-200 p-5 sticky top-4">
              {/* Total time */}
              <div className="mb-4 text-center">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">總時間</p>
                <p className="text-4xl font-mono font-bold text-gray-900">{formatTime(totalSecs)}</p>
              </div>

              {/* Interval time — AI_Pair only */}
              {participant?.group !== "AI_Solo" &&
            <div className="mb-5 text-center">
                  <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">計時時間</p>
                  <p className="text-4xl font-mono font-bold text-blue-600">{formatTime(intervalSecs)}</p>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${intervalSecs / INTERVAL_SECS * 100}%` }} />
                
                  </div>
                </div>
            }

              {/* Roles — AI_Pair only */}
              {participant?.group !== "AI_Solo" &&
            <div className="space-y-3 mb-5">
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
                    <p className="text-sm font-semibold text-indigo-400 uppercase tracking-wide mb-0.5">導航員</p>
                    <p className="text-lg font-bold text-indigo-700">{roleInfo.navigator}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                    <p className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-0.5">駕駛員</p>
                    <p className="text-lg font-bold text-amber-700">{roleInfo.driver}</p>
                  </div>
                </div>
            }

              {/* Gemini input */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Gemini</p>
                <GeminiInput
                rolePhase={participant?.group === "AI_Solo" ? null : rolePhase}
                participantId={participantId}
                codeText={form.code_text}
                isSolo={participant?.group === "AI_Solo"} />
              
              </div>
            </div>
          </div>
        }
      </div>
    </div>);

}