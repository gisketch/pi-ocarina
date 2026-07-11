import { open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";

export const LEASE_TTL_MS = 5 * 60_000;

export function shouldRefreshFromDisk(diskMtime: number | undefined, baselineMtime: number | undefined, running: boolean) {
  return !running && diskMtime !== undefined && baselineMtime !== undefined && diskMtime > baselineMtime;
}

export function leasePath(sessionFile: string) { return `${sessionFile}.lease`; }

export function pidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error instanceof Error && "code" in error && error.code === "EPERM"; }
}

export async function acquireLease(sessionFile: string, now = Date.now()) {
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
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST") || !ours) throw new Error("Session is active in another process", { cause: error });
    await writeFile(path, `${JSON.stringify(lease)}\n`, { mode: 0o600 });
  }
  return path;
}

type Lease = { pid: number; hostname: string; startedAt?: string; surface?: string; mtimeMs: number };
export async function readLease(path: string): Promise<Lease | undefined> {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.pid) || typeof record.pid !== "number" || typeof record.hostname !== "string") return undefined;
    return { pid: record.pid, hostname: record.hostname, mtimeMs: info.mtimeMs, ...(typeof record.startedAt === "string" ? { startedAt: record.startedAt } : {}), ...(typeof record.surface === "string" ? { surface: record.surface } : {}) };
  } catch { return undefined; }
}

export async function sessionSchema(sessionFile: string, runtimeVersion: number) {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(sessionFile, "r");
    const buffer = Buffer.allocUnsafe(16 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const first = buffer.toString("utf8", 0, bytesRead).split("\n", 1)[0] ?? "";
    const parsed: unknown = JSON.parse(first);
    const header = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    const fileVersion = header.type === "session" ? (typeof header.version === "number" ? header.version : 1) : undefined;
    return { fileVersion, runtimeVersion, newer: fileVersion !== undefined && fileVersion > runtimeVersion };
  } catch { return { runtimeVersion, newer: false }; }
  finally { await file?.close(); }
}
