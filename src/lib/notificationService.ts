// src/lib/notificationService.ts
"use client";

export type NotificationLevel = "info" | "success" | "warning" | "error" | "critical";

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  description?: string;
  timestamp: number;
  source?: string;
  action?: { label: string; onClick: () => void };
  persistent?: boolean;
  timeout?: number;
}

let notifications: Notification[] = [];
let counter = 0;

function notify(level: NotificationLevel, title: string, opts?: { description?: string; source?: string; action?: { label: string; onClick: () => void }; persistent?: boolean; timeout?: number }) {
  const id = `notif-${++counter}`;
  const n: Notification = {
    id,
    level,
    title,
    description: opts?.description,
    timestamp: Date.now(),
    source: opts?.source,
    action: opts?.action,
    persistent: opts?.persistent ?? false,
    timeout: opts?.timeout ?? (level === "error" || level === "critical" ? 15000 : 5000),
  };
  notifications = [n, ...notifications].slice(0, 50);
  broadcast();

  if (!n.persistent) {
    setTimeout(() => {
      notifications = notifications.filter((x) => x.id !== id);
      broadcast();
    }, n.timeout);
  }
  return id;
}

function broadcast() {
  listeners.forEach((l) => l(notifications));
}

type Listener = (notifications: Notification[]) => void;
const listeners: Set<Listener> = new Set();

export function clearNotification(id: string) {
  notifications = notifications.filter((x) => x.id !== id);
  broadcast();
}

export function clearAll() {
  notifications = [];
  broadcast();
}

export const notification = {
  info: (title: string, opts?: Parameters<typeof notify>[2]) => notify("info", title, opts),
  success: (title: string, opts?: Parameters<typeof notify>[2]) => notify("success", title, opts),
  warning: (title: string, opts?: Parameters<typeof notify>[2]) => notify("warning", title, opts),
  error: (title: string, opts?: Parameters<typeof notify>[2]) => notify("error", title, opts),
  critical: (title: string, opts?: Parameters<typeof notify>[2]) => notify("critical", title, opts),
};

export function subscribeNotifications(listener: Listener) {
  listeners.add(listener);
  listener(notifications);
  return () => { listeners.delete(listener); };
}

export function getNotifications(): Notification[] {
  return notifications;
}
