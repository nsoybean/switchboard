import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CircleCheck, CircleAlert, CirclePause, MessageCircleQuestion } from "lucide-react";
import type { SessionStatus } from "@/state/types";

export interface NotchNotificationItem {
  id: string;
  sessionId: string;
  label: string;
  status: SessionStatus;
}

interface NotchNotificationProps {
  notifications: NotchNotificationItem[];
  onDismiss: (id: string) => void;
  onClick: (sessionId: string) => void;
}

function statusIcon(status: SessionStatus) {
  switch (status) {
    case "idle":
      return <CirclePause className="size-3.5 shrink-0 text-blue-400" />;
    case "done":
      return <CircleCheck className="size-3.5 shrink-0 text-emerald-400" />;
    case "error":
    case "stopped":
      return <CircleAlert className="size-3.5 shrink-0 text-red-400" />;
    case "needs-input":
      return (
        <MessageCircleQuestion className="size-3.5 shrink-0 text-amber-400" />
      );
    default:
      return null;
  }
}

function statusLabel(status: SessionStatus) {
  switch (status) {
    case "idle":
      return "idle";
    case "done":
      return "finished";
    case "error":
      return "errored";
    case "stopped":
      return "stopped";
    case "needs-input":
      return "needs input";
    default:
      return status;
  }
}

function NotchPill({
  item,
  onDismiss,
  onClick,
}: {
  item: NotchNotificationItem;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 5s
    const dismissTimer = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onDismiss, 300);
    }, 5000);

    return () => {
      cancelAnimationFrame(enterTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        setVisible(false);
        window.setTimeout(onDismiss, 150);
      }}
      className={cn(
        "flex items-center gap-2 rounded-full border border-border/60 bg-popover/95 px-3.5 py-1.5",
        "shadow-lg backdrop-blur-md cursor-pointer",
        "transition-all duration-300 ease-out",
        "hover:bg-accent hover:border-border",
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0",
      )}
    >
      {statusIcon(item.status)}
      <span className="max-w-[200px] truncate text-xs font-medium text-foreground">
        {item.label}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {statusLabel(item.status)}
      </span>
    </button>
  );
}

export function NotchNotification({
  notifications,
  onDismiss,
  onClick,
}: NotchNotificationProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-1 z-[100] flex flex-col items-center gap-1.5">
      {notifications.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <NotchPill
            item={item}
            onDismiss={() => onDismiss(item.id)}
            onClick={() => onClick(item.sessionId)}
          />
        </div>
      ))}
    </div>
  );
}
