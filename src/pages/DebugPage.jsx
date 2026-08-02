export default function DebugPage() {
  console.log('[DebugPage] Rendering!');
  
  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: 'green', fontSize: '24px' }}>✓ React is working!</h1>
      <p style={{ color: '#333', fontSize: '16px' }}>
        If you can see this message, React and routing are working correctly.
      </p>
      <p style={{ color: '#666', fontSize: '14px', marginTop: '20px' }}>
        Console logs:
      </p>
      <ul style={{ color: '#666', fontSize: '13px', lineHeight: '1.8' }}>
        <li>- Check browser console (F12) for [App], [AuthProvider], [AuthContext] logs</li>
        <li>- These logs will tell us where the rendering is blocked</li>
      </ul>
      <a href="/CheckIn" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#007bff', color: 'white', textDecoration: 'none', borderRadius: '6px' }}>
        ← Back to CheckIn
      </a>
    </div>
  );
}