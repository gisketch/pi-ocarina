const key = "pi-ocarina:notifications";
export const defaultCategories = { completed: true, failed: true, attention: true };
export type NotificationCategory = keyof typeof defaultCategories;
export type NotificationCategories = Record<NotificationCategory, boolean>;

export function notificationCategories(): NotificationCategories {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaultCategories;
    const record = stored as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaultCategories).map(([name, fallback]) => [name, typeof record[name] === "boolean" ? record[name] : fallback])) as NotificationCategories;
  }
  catch { return defaultCategories; }
}

export function saveNotificationCategories(value: NotificationCategories) { localStorage.setItem(key, JSON.stringify(value)); }

export function shouldRequestPermission({ backgrounded, running, categories, permission }: { backgrounded: boolean; running: boolean; categories: NotificationCategories; permission: NotificationPermission }) {
  return backgrounded && running && permission === "default" && Object.values(categories).some(Boolean);
}

export function shouldNotify({ focused, selected, category, categories }: { focused: boolean; selected: boolean; category: NotificationCategory; categories: NotificationCategories }) {
  return (!focused || !selected) && Boolean(categories[category]);
}
