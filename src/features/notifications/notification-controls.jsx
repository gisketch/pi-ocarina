// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { requestPermission } from "@tauri-apps/plugin-notification";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { defaultCategories, notificationCategories, saveNotificationCategories } from "./notification-policy.js";

export function NotificationControls() {
  const [permission, setPermission] = useState("default");
  const [categories, setCategories] = useState(notificationCategories);
  const refresh = () => setPermission(Notification.permission);
  useEffect(() => { refresh(); addEventListener("focus", refresh); return () => removeEventListener("focus", refresh); }, []);
  const toggle = (/** @type {keyof typeof defaultCategories} */ name) => {
    const next = { ...categories, [name]: !categories[name] }; setCategories(next); saveNotificationCategories(next);
  };
  return <div className="flex flex-wrap items-center gap-1" aria-label="Notifications">
    {Object.keys(defaultCategories).map((name) => <Button key={name} size="sm" variant={categories[name] ? "secondary" : "ghost"} aria-pressed={categories[name]} onClick={() => toggle(/** @type {keyof typeof defaultCategories} */ (name))}>{name}</Button>)}
    {permission === "default" && <Button size="sm" variant="outline" onClick={() => void requestPermission().then(setPermission)}>Ask macOS</Button>}
    {permission === "denied" && <Button size="sm" variant="outline" onClick={() => void invoke("open_notification_settings")}>Open System Settings</Button>}
    {permission === "granted" && <span className="text-xs text-muted-foreground">Enabled in macOS</span>}
  </div>;
}
