export default function DegradedBanner({ queueCount = 0, syncStatus = null }) {
  return (
    <div className="w-full bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-sm">
      <span className="text-amber-800 font-medium">
        ⚠️ 目前網路較慢，系統已切換為低網路模式。你可以繼續作答，資料會在網路恢復後自動同步。
      </span>
      <span className="text-amber-700 text-xs flex items-center gap-2">
        {syncStatus === "syncing" && <span className="animate-pulse">🔄 同步中...</span>}
        {syncStatus === "success" && <span className="text-green-700">✓ 同步成功</span>}
        {syncStatus === "failed" && <span className="text-red-600">✗ 同步失敗，稍後重試</span>}
        {queueCount > 0 && syncStatus !== "syncing" && (
          <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
            有 {queueCount} 筆資料等待同步
          </span>
        )}
      </span>
    </div>
  );
}