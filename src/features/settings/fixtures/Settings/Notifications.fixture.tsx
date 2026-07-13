import { NotificationsSettings } from "@/features/settings/notifications-settings";

export default <div className="mx-auto max-w-4xl p-8"><NotificationsSettings visibleIds={new Set(["notification-completed", "notification-failed", "notification-attention", "notification-permission"])} /></div>;
