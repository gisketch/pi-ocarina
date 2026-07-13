import { requestPermission } from "@tauri-apps/plugin-notification";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { invokeTauri } from "@/shared/lib/tauri-client";
import { defaultCategories, notificationCategories, saveNotificationCategories, type NotificationCategory } from "@/features/notifications/notification-policy";
import { SettingRow, SettingsSection, SettingToggle } from "./settings-layout";

const descriptions: Record<NotificationCategory, string> = {
  completed: "Notify when a background thread completes.", failed: "Notify when a background thread fails.", attention: "Notify when a thread needs your input.",
};

export function NotificationsSettings({ visibleIds }: { visibleIds: Set<string> }) {
  const [permission, setPermission] = useState<NotificationPermission>(() => Notification.permission);
  const [categories, setCategories] = useState(notificationCategories);
  useEffect(() => { const refresh = () => { setPermission(Notification.permission); setCategories(notificationCategories()); }; addEventListener("focus", refresh); addEventListener("storage", refresh); return () => { removeEventListener("focus", refresh); removeEventListener("storage", refresh); }; }, []);
  const toggle = (category: NotificationCategory, enabled: boolean) => { const next = { ...categories, [category]: enabled }; setCategories(next); saveNotificationCategories(next); };
  return <>
    <SettingsSection title="Categories">{(Object.keys(defaultCategories) as NotificationCategory[]).filter((category) => visibleIds.has(`notification-${category}`)).map((category) => <SettingRow id={`notification-${category}`} key={category} label={category[0]!.toUpperCase() + category.slice(1)} description={descriptions[category]}><SettingToggle checked={categories[category]} label={`${category} notifications`} onChange={(enabled) => toggle(category, enabled)} /></SettingRow>)}</SettingsSection>
    {visibleIds.has("notification-permission") && <SettingsSection title="macOS permission"><SettingRow id="notification-permission" label={permission === "granted" ? "Allowed" : permission === "denied" ? "Denied" : "Not requested"} description="System permission is separate from notification categories.">{permission === "default" ? <Button variant="outline" onClick={() => void requestPermission().then(setPermission)}>Ask macOS</Button> : permission === "denied" ? <Button variant="outline" onClick={() => void invokeTauri("open_notification_settings")}>Open System Settings</Button> : <span className="text-success">Enabled</span>}</SettingRow></SettingsSection>}
  </>;
}
