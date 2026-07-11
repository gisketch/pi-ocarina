import { open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";

export const LEASE_TTL_MS = 5 * 60_000;

export function shouldRefreshFromDisk(diskMtime, baselineMtime, running) {
  return !running && diskMtime !== undefined && baselineMtime !== undefined && diskMtime > baselineMtime;
}

export function leasePath(sessionFile) { return `${sessionFile}.lease`; }

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

export async function acquireLease(sessionFile, now = Date.now()) {
  const path = leasePath(sessionFile);
  const existing = await readLease(path);
  const selfHost = hostname();
  const ours = existing?.pid === process.pid && existing.hostname === selfHost;
  if (existing && !ours) {
    const alive = existing.hostname === selfHost ? pidAlive(existing.pid) : now - existing.mtimeMs <= LEASE_TTL_MS;
    if (alive) throw new Error(`Session is active in ${existing.surface || "another process"}`);
    await rm(path, { force: true });
  }
  if (!existing) await rm(path, { force: true });
  const lease = { pid: process.pid, hostname: selfHost, startedAt: new Date(now).toISOString(), surface: "pi-ocarina" };
  try {
    const file = await open(path, "wx", 0o600);
    try { await file.writeFile(`${JSON.stringify(lease)}\n`); }
    finally { await file.close(); }
  } catch (error) {
    if (error?.code !== "EEXIST" || !ours) throw new Error("Session is active in another process");
    await writeFile(path, `${JSON.stringify(lease)}\n`, { mode: 0o600 });
  }
  return path;
}

export async function readLease(path) {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const value = JSON.parse(raw);
    if (!Number.isInteger(value.pid) || typeof value.hostname !== "string") return undefined;
    return { ...value, mtimeMs: info.mtimeMs };
  } catch { return undefined; }
}

export async function sessionSchema(sessionFile, runtimeVersion) {
  let file;
  try {
    file = await open(sessionFile, "r");
    const buffer = Buffer.allocUnsafe(16 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const first = buffer.toString("utf8", 0, bytesRead).split("\n", 1)[0];
    const header = JSON.parse(first);
    const fileVersion = header.type === "session" ? (typeof header.version === "number" ? header.version : 1) : undefined;
    return { fileVersion, runtimeVersion, newer: fileVersion !== undefined && fileVersion > runtimeVersion };
  } catch { return { runtimeVersion, newer: false }; }
  finally { await file?.close(); }
}
