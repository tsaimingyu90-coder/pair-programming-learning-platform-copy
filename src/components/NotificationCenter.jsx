import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Bell } from "lucide-react";

const STORAGE_KEY = "seen_rated_attempts";

function getSeenIds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function markSeen(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export default function NotificationCenter({ participant }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const dropdownRef = useRef(null);

  const loadNotifications = async () => {
    if (!participant?.id) return;
    const attempts = await base44.entities.Attempt.filter({ participant: participant.id });
    const rated = attempts.filter(a => a.teacher_rating || a.teacher_feedback);
    const seenIds = getSeenIds();
    const notifs = rated.map(a => ({
      id: a.id,
      assignment: a.assignment,
      rating: a.teacher_rating,
      feedback: a.teacher_feedback,
      updated: a.updated_date,
      isNew: !seenIds.includes(a.id),
    })).sort((a, b) => new Date(b.updated) - new Date(a.updated));
    setNotifications(notifs);
    setUnread(notifs.filter(n => n.isNew).length);
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 10000);
    return () => clearInterval(timer);
  }, [participant?.id]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) {
      // Mark all as seen
      const allIds = notifications.map(n => n.id);
      markSeen(allIds);
      setUnread(0);
      setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
    }
  };

  const handleNotifClick = async (notif) => {
    setOpen(false);
    // fetch assignment to get week/task numbers
    const assignment = await base44.entities.Assignment.get(notif.assignment);
    if (assignment) {
      window.location.href = `${createPageUrl("TaskPage")}?week=${assignment.week_number}&task=${assignment.task_number}`;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition text-gray-500"
        title="通知中心"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none px-1 ${unread <= 9 ? "w-4" : unread <= 99 ? "min-w-[1.25rem]" : "min-w-[1.5rem]"}`}>
            {unread > 99 ? "99+" : unread > 9 ? `${unread}` : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">通知中心</h3>
            <span className="text-xs text-gray-400">{notifications.length} 則</span>
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">暫無通知</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 ${notif.isNew ? "bg-blue-50" : ""}`}
                >
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.isNew ? "bg-blue-500" : "bg-gray-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      作業已評分
                      {notif.rating && (
                        <span className={`ml-2 font-bold ${
                          notif.rating === '優' ? 'text-green-600' :
                          notif.rating === '甲' ? 'text-blue-600' :
                          notif.rating === '乙' ? 'text-yellow-600' :
                          notif.rating === '丙' ? 'text-orange-600' :
                          'text-red-600'
                        }`}>【{notif.rating}】</span>
                      )}
                    </p>
                    {notif.feedback && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.feedback}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(notif.updated).toLocaleString('zh-TW')}
                    </p>
                  </div>
                  <span className="text-xs text-blue-500 flex-shrink-0 mt-0.5">查看 →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}