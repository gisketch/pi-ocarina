// @ts-check

/** @param {string} workspaceId */
export function loadCompatibility(workspaceId) {
  try { return JSON.parse(localStorage.getItem(`extension-compatibility:${workspaceId}`) ?? "{}"); }
  catch { return {}; }
}

/** @param {string} workspaceId @param {Record<string, any>} records */
export function saveCompatibility(workspaceId, records) {
  localStorage.setItem(`extension-compatibility:${workspaceId}`, JSON.stringify(records));
}

/** @param {string} prompt @param {Array<any>} commands @param {Record<string, any>} records */
export function blockedCommand(prompt, commands = [], records = {}) {
  const name = prompt.trim().match(/^\/([^\s]+)/)?.[1];
  const command = commands.find((item) => item.source === "extension" && item.name === name);
  return command ? records[`${command.extensionPath ?? "unknown"}::${command.name}`] : undefined;
}
