export default function TestPage() {
  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-green-200 p-10 text-center max-w-lg w-full">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">路由測試成功！</h1>
        <p className="text-sm text-gray-500 mb-4">
          如果你看得到這個頁面，表示 React Router 正常運作。
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left text-xs text-blue-800 mb-4">
          <p className="font-semibold mb-2">測試結果：</p>
          <ul className="space-y-1">
            <li>✓ React 渲染正常</li>
            <li>✓ 路由系統正常</li>
            <li>✓ Tailwind CSS 正常</li>
            <li>✓ 組件載入正常</li>
          </ul>
        </div>
        <a
          href="/"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          返回首頁
        </a>
      </div>
    </div>
  );
}