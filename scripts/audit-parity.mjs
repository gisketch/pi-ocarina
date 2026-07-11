import { readFileSync, readdirSync } from "node:fs";

const flows = readFileSync(".scratch/pi-gui-tauri-parity/flows.md", "utf8");
const issues = new Map(readdirSync(".scratch/pi-gui-tauri-parity/issues").map((name) => [name.slice(0, 2), { name, text: readFileSync(`.scratch/pi-gui-tauri-parity/issues/${name}`, "utf8") }]));
const rows = flows.split("\n").filter((line) => /^\| F\d{3} \|/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
const ids = new Set(); const errors = [];
for (const [id, , , owner, check] of rows) {
  if (ids.has(id)) errors.push(`${id}: duplicate flow`); ids.add(id);
  if (owner.startsWith("Excluded —")) { if (!check) errors.push(`${id}: missing exclusion check`); continue; }
  const ticket = owner.match(/^(\d{2}) —/)?.[1];
  if (!ticket || !issues.has(ticket)) errors.push(`${id}: invalid owner ${owner}`);
  if (!check || /TBD|unverified/i.test(check)) errors.push(`${id}: missing acceptance check`);
  const status = issues.get(ticket)?.text.match(/^\*\*Status:\*\* (.+)$/m)?.[1];
  if (ticket !== "43" && !["complete", "done"].includes(status)) errors.push(`${id}: owner ${ticket} is ${status ?? "missing status"}`);
}
for (let number = 1; number <= 42; number += 1) {
  const ticket = String(number).padStart(2, "0"); const status = issues.get(ticket)?.text.match(/^\*\*Status:\*\* (.+)$/m)?.[1];
  if (!["complete", "done"].includes(status)) errors.push(`ticket ${ticket}: ${status ?? "missing"}`);
}
const exclusions = flows.match(/## Explicit Exclusions\n\n([\s\S]*?)\n\n##/)?.[1].split("\n").filter((line) => line.startsWith("- ")) ?? [];
if (exclusions.length !== 5) errors.push(`expected 5 exclusion groups, found ${exclusions.length}`);
const excludedRows = rows.filter(([, , , owner]) => owner.startsWith("Excluded —")).length;
const included = rows.length - excludedRows;
console.log(JSON.stringify({ included, excludedRows, excludedGroups: exclusions.length, passing: included - errors.filter((error) => /^F/.test(error)).length, failing: errors.length, unverified: 0, errors }, null, 2));
if (errors.length) process.exit(1);
