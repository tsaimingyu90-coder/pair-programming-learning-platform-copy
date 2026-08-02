import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

export default function BatchUpdateClass() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const namesToUpdate = ["雷蛇蛇", "蔡明佑", "蔡銘又", "林小美", "王大又", "蔡先生"];

  const handleUpdate = async () => {
    if (!confirm(`確定要將以下 ${namesToUpdate.length} 位參與者的班級改為「測試班級」並重新配發 T 開頭 ID 嗎？\n\n${namesToUpdate.map(n => `• ${n}`).join("\n")}\n\n此操作不可逆！`)) {
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await base44.functions.invoke("updateTestClassParticipants", {});
      setResult(response.data);
    } catch (err) {
      setError(`❌ 更新失敗：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">批量更新班級</h1>
              <p className="text-sm text-gray-500 mt-0.5">將指定參與者移至測試班級並重新配發 ID</p>
            </div>
            <a href={createPageUrl("ParticipantManager")} className="text-xs text-gray-400 hover:text-gray-600">← 返回管理</a>
          </div>
        </div>

        {/* Target List */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">目標參與者清單</h2>
          <div className="space-y-1">
            {namesToUpdate.map((name, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                <span className="text-gray-700">{name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            這些參與者的班級將被改為「測試班級」，並重新配發 T 開頭的參與者 ID（T001, T002, ...）
          </p>
        </div>

        {/* Action Button */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="w-full py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
          >
            {loading ? "⏳ 處理中..." : `🔄 批量更新 ${namesToUpdate.length} 位參與者`}
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            操作不可逆，請謹慎執行
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-700 font-medium whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">✅</span>
              <h2 className="text-base font-bold text-green-800">更新完成</h2>
            </div>
            <p className="text-sm text-green-700 mb-3">
              成功更新 {result.count} 位參與者
            </p>
            <div className="bg-white rounded-lg border border-green-200 p-3 max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-green-100">
                  <tr>
                    <th className="text-left py-1 text-green-700">姓名</th>
                    <th className="text-left py-1 text-green-700">舊 ID</th>
                    <th className="text-left py-1 text-green-700">新 ID</th>
                    <th className="text-left py-1 text-green-700">舊班級</th>
                    <th className="text-left py-1 text-green-700">新班級</th>
                  </tr>
                </thead>
                <tbody>
                  {result.updated.map((item, idx) => (
                    <tr key={idx} className="border-b border-green-50 last:border-0">
                      <td className="py-1.5 text-gray-700 font-medium">{item.name}</td>
                      <td className="py-1.5 text-gray-500 font-mono">{item.old_id}</td>
                      <td className="py-1.5 text-blue-600 font-bold font-mono">{item.new_id}</td>
                      <td className="py-1.5 text-gray-500">{item.old_class}</td>
                      <td className="py-1.5 text-green-600 font-medium">{item.new_class}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}