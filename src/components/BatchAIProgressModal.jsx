import { useState, useEffect } from "react";

export default function BatchAIProgressModal({
  isOpen,
  mode, // 'feedback' | 'rating'
  total,
  processed,
  succeeded,
  failed,
  skipped,
  currentItem,
  isProcessing,
  results,
  onClose,
  onRetryFailed
}) {
  const [expandedTab, setExpandedTab] = useState('summary');
  
  if (!isOpen) return null;

  const failedItems = results.filter(r => r.status === 'failed');
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* 標題 */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            批次 {mode === 'feedback' ? 'AI 回饋' : 'AI 等第'} - 進度監視
          </h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-gray-600 text-xl disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* 進度摘要 */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800">{total}</p>
              <p className="text-xs text-gray-500">總任務數</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{processed}</p>
              <p className="text-xs text-gray-500">已處理</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{succeeded}</p>
              <p className="text-xs text-gray-500">成功</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{failed}</p>
              <p className="text-xs text-gray-500">失敗</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{skipped}</p>
              <p className="text-xs text-gray-500">跳過</p>
            </div>
          </div>

          {/* 進度條 */}
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{progress}% 完成</p>
        </div>

        {/* 選取統計 */}
        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-200">
          <p className="text-xs font-semibold text-indigo-700 mb-2">📊 任務統計</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-xs">
              <p className="text-indigo-600 font-medium">
                依任務分組：{(() => {
                  const assignmentGroups = {};
                  results.forEach(r => {
                    const aId = r.item.assignmentId;
                    assignmentGroups[aId] = (assignmentGroups[aId] || 0) + 1;
                  });
                  return Object.keys(assignmentGroups).length;
                })()}
              </p>
            </div>
            <div className="text-xs">
              <p className="text-indigo-600 font-medium">
                依學生分組：{(() => {
                  const participantGroups = {};
                  results.forEach(r => {
                    const pId = r.item.participantId;
                    participantGroups[pId] = (participantGroups[pId] || 0) + 1;
                  });
                  return Object.keys(participantGroups).length;
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* 當前處理中 */}
        {isProcessing && currentItem && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
            <p className="text-sm font-medium text-blue-900">
              ⏳ 處理中：{currentItem.participantId} - {currentItem.assignmentId}
            </p>
          </div>
        )}

        {/* 標籤 */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {['summary', 'success', 'failed', 'skipped'].map(tab => (
            <button
              key={tab}
              onClick={() => setExpandedTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 ${
                expandedTab === tab
                  ? 'border-blue-500 text-blue-600 bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab === 'summary' && '摘要'}
              {tab === 'success' && `成功 (${succeeded})`}
              {tab === 'failed' && `失敗 (${failed})`}
              {tab === 'skipped' && `跳過 (${skipped})`}
            </button>
          ))}
        </div>

        {/* 內容區域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {expandedTab === 'summary' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                已成功對 <span className="font-bold text-green-600">{succeeded}</span> 筆進行 {mode === 'feedback' ? 'AI 回饋' : 'AI 等第'}。
              </p>
              {failed > 0 && (
                <p className="text-sm text-gray-700">
                  有 <span className="font-bold text-red-600">{failed}</span> 筆失敗，可稍後重試。
                </p>
              )}
              {skipped > 0 && (
                <p className="text-sm text-gray-700">
                  有 <span className="font-bold text-orange-600">{skipped}</span> 筆被跳過（例如無程式碼）。
                </p>
              )}
              {!isProcessing && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
                  <p className="text-sm text-green-800 font-medium">✓ 批次處理完成</p>
                </div>
              )}
            </div>
          )}

          {expandedTab === 'success' && (
            <div className="space-y-2">
              {results
                .filter(r => r.status === 'success')
                .map((r, idx) => (
                  <div key={idx} className="text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
                    <p className="font-medium text-green-800">
                      {r.item.participantId} - {r.item.assignmentId}
                    </p>
                  </div>
                ))}
            </div>
          )}

          {expandedTab === 'failed' && (
            <div className="space-y-2">
              {failedItems.length === 0 ? (
                <p className="text-sm text-gray-500">無失敗項目</p>
              ) : (
                failedItems.map((r, idx) => (
                  <div key={idx} className="text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
                    <p className="font-medium text-red-800">
                      {r.item.participantId} - {r.item.assignmentId}
                    </p>
                    <p className="text-xs text-red-600 mt-1">{r.error}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {expandedTab === 'skipped' && (
            <div className="space-y-2">
              {results
                .filter(r => r.status === 'skipped')
                .map((r, idx) => (
                  <div key={idx} className="text-sm bg-orange-50 border border-orange-200 rounded px-3 py-2">
                    <p className="font-medium text-orange-800">
                      {r.item.participantId} - {r.item.assignmentId}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">{r.error || r.result?.reason}</p>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 底部按鈕 */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          {failedItems.length > 0 && !isProcessing && (
            <button
              onClick={onRetryFailed}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition"
            >
              🔄 重試失敗項目
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isProcessing ? '處理中...' : '關閉'}
          </button>
        </div>
      </div>
    </div>
  );
}