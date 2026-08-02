export default function DashboardHeaderButtons({ onExportCSV, onCheckInvalid, onRefresh, checkingInvalid, invalidResult, onPaperQuiz }) {
  return (
    <div className="flex gap-2 flex-wrap justify-end">
      <a href="/AttendancePage" className="px-4 py-2 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700 font-medium hover:bg-teal-100 transition">
        📋 出缺勤紀錄
      </a>
      <a href="/PaperQuizInput" className="px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 font-medium hover:bg-orange-100 transition">
        📝 紙本測驗輸入
      </a>
      <a href="/PreTestResults" className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium hover:bg-green-100 transition">
        📊 前測結果
      </a>
      <a href="/PostTestPage" className="px-4 py-2 bg-cyan-50 border border-cyan-200 rounded-lg text-sm text-cyan-700 font-medium hover:bg-cyan-100 transition">
        📊 後測結果
      </a>
      <a href="/AssignmentManager" className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-medium hover:bg-amber-100 transition">
        📋 任務管理
      </a>
      <a href="/ChatLogPage" className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700 font-medium hover:bg-indigo-100 transition">
        💬 AI 對話紀錄
      </a>
      <a href="/SystemPromptManager" className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700 font-medium hover:bg-purple-100 transition">
        ⚙️ Prompt 管理
      </a>
      <a href="/TestComparison" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
        📊 前後測比較
      </a>
      <button
        onClick={onExportCSV}
        className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
      >
        ⬇ 匯出 CSV
      </button>
      <button
        onClick={onCheckInvalid}
        disabled={checkingInvalid}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${invalidResult ? "bg-red-100 text-red-700 border border-red-200 hover:bg-red-200" : "bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100"}`}
      >
        {checkingInvalid ? "偵測中..." : invalidResult ? `🔴 ${invalidResult.invalid_count} 筆無效` : "🧪 無效資料偵測"}
      </button>
      <button
        onClick={onRefresh}
        className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
      >
        ↻ 立即更新
      </button>
    </div>
  );
}