import { useEffect } from "react";
import { Icon, type IconName } from "./Icon";
import "./Notification.css";

interface NotificationProps {
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
  onClose: () => void;
}

export function Notification({
  message,
  type = "info",
  duration = 4000,
  onClose,
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = (): IconName => {
    if (type === "success") return "CircleCheck";
    if (type === "warning") return "TriangleAlert";
    if (type === "error") return "CircleX";
    return "Info";
  };

  return (
    <div className={`notification notification--${type}`}>
      <Icon name={getIcon()} size={20} className="notification-icon" />
      <span className="notification-message">{message}</span>
      <button className="notification-close" onClick={onClose}>
        <Icon name="X" size={16} />
      </button>
    </div>
  );
}
