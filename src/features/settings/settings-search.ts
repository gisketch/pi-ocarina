export type SettingDescriptor = { id: string; label: string; description?: string };

export function matchingSettings(settings: SettingDescriptor[], query: string) {
  const needle = query.trim().toLowerCase();
  return needle ? settings.filter(({ label, description }) => `${label} ${description ?? ""}`.toLowerCase().includes(needle)) : settings;
}
