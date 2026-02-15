import { useEffect, useRef, useState } from "react";
import "./HeaderNotification.css";

interface HeaderNotificationProps {
  message: string;
  onComplete?: () => void;
  typingSpeed?: number;
  visibleDuration?: number;
}

export function HeaderNotification({
  message,
  onComplete,
  typingSpeed = 40,
  visibleDuration = 2500,
}: HeaderNotificationProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;

    setDisplayedText("");
    setIsTyping(true);
    cancelledRef.current = false;

    let i = 0;
    const typeNext = () => {
      if (cancelledRef.current) return;
      if (i < message.length) {
        setDisplayedText(message.slice(0, i + 1));
        i++;
        timerRef.current = setTimeout(typeNext, typingSpeed);
      } else {
        setIsTyping(false);
        timerRef.current = setTimeout(() => {
          if (!cancelledRef.current) onComplete?.();
        }, visibleDuration);
      }
    };

    timerRef.current = setTimeout(typeNext, typingSpeed);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, typingSpeed, visibleDuration, onComplete]);

  if (!message) return null;

  return (
    <span className="header-notification">
      <span className="header-notification-text">{displayedText}</span>
      {isTyping && <span className="header-notification-cursor">|</span>}
    </span>
  );
}
