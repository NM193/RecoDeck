import { useEffect, useRef, useState } from "react";
import "./PromptModal.css";

interface PromptModalProps {
  open: boolean;
  title: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title,
  defaultValue = "",
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, defaultValue]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <div className="prompt-modal-backdrop" onClick={onCancel}>
      <div
        className="prompt-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
      >
        <h2 id="prompt-modal-title" className="prompt-modal-title">
          {title}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="prompt-modal-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
            aria-label={title}
          />
          <div className="prompt-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
