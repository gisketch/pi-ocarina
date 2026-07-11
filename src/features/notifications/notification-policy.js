const key = "pi-ocarina:notifications";
export const defaultCategories = { completed: true, failed: true, attention: true };

export function notificationCategories() {
  try { return { ...defaultCategories, ...JSON.parse(localStorage.getItem(key) ?? "{}") }; }
  catch { return defaultCategories; }
}

export function saveNotificationCategories(value) { localStorage.setItem(key, JSON.stringify(value)); }

export function shouldRequestPermission({ backgrounded, running, categories, permission }) {
  return backgrounded && running && permission === "default" && Object.values(categories).some(Boolean);
}

export function shouldNotify({ focused, selected, category, categories }) {
  return (!focused || !selected) && Boolean(categories[category]);
}
