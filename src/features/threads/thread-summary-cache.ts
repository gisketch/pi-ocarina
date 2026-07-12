import type { ThreadSummary } from "@/shared/contracts/app";

const summaries = new Map<string, ThreadSummary[]>();

export function cachedThreadSummaries(workspaceId: string) {
  return summaries.get(workspaceId) ?? [];
}

export function cachedWorkspaceThreads(workspaceIds: string[]) {
  return Object.fromEntries(workspaceIds.flatMap((id) => summaries.has(id) ? [[id, summaries.get(id)!]] : []));
}

export function cacheThreadSummaries(workspaceId: string, threads: ThreadSummary[]) {
  summaries.set(workspaceId, threads);
}
