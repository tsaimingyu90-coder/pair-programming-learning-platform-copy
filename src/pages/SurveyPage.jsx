import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

export default function SurveyPage() {
  const [participant, setParticipant] = useState(null);

  const [form, setForm] = useState({
    survey_type: "pre",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const p = sessionStorage.getItem("participant");
    if (p) setParticipant(JSON.parse(p));


  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.survey_type === "post") {
      alert("目前問卷尚未開放");
      return;
    }
    if (!participant) return;
    setLoading(true);
    const type = form.survey_type;
    setLoading(false);
    window.location.href = `/QuizPage?type=${type}&id=${participant.participant_id}`;
  };

  if (!participant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">No participant session found.</p>
          <a href={createPageUrl("CheckIn")} className="text-blue-600 underline text-sm">Go to Check-in</a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-green-200 p-10 text-center max-w-sm w-full">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">問卷已提交</h2>
          <p className="text-sm text-gray-500 mb-6">感謝你的填寫！</p>
          <a
            href={createPageUrl("CheckIn")}
            className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            開始新的課程
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <h1 className="text-xl font-bold text-gray-900">問卷調查</h1>
          <p className="text-sm text-gray-500">參與者：<span className="font-medium text-gray-700">{participant.participant_id}</span></p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4 text-sm text-gray-700 leading-relaxed">
          <p className="font-semibold text-gray-800 mb-2">說明</p>
          <p>各位同學：</p>
          <p className="mt-2">這份調查問卷是針對本學期課程中的學習活動所進行的，本問卷想要瞭解同學目前的程式設計學習成就狀態，以及進行程式設計時的焦慮感和自我效能感。這不是考試，沒有標準答案，也不會影響您的成績。請您依照自己的學習情況來回答。</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">問卷類型</label>
              <div className="flex gap-3">
                {["pre", "post"].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("survey_type", t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${form.survey_type === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
                  >
                    {t === "pre" ? "前測問卷" : "後測問卷"}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? "提交中…" : "開始問卷調查"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}