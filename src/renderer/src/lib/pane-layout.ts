import type { Thread, Workspace } from './types'

export function attachmentFor(workspace: Workspace, hostId: string): Thread | undefined {
  return workspace.threads.find(
    (thread) => thread.terminal && thread.attachment?.hostId === hostId,
  )
}

/** The order a person sees, independent of where attachment records sit in the
 *  catalog array. */
export function visualColumns(workspace: Workspace): Thread[] {
  const result: Thread[] = []
  for (const host of workspace.threads.filter((thread) => !thread.terminal)) {
    const attachment = attachmentFor(workspace, host.id)
    if (attachment?.attachment?.side === 'left') result.push(attachment)
    result.push(host)
    if (attachment?.attachment?.side === 'right') result.push(attachment)
  }
  return result
}

/** One spatial Shift-H/L move. Hosts carry their attachment through strip
 *  order; attachments cross their host before magnetising to a neighbour. */
export function movePane(workspace: Workspace, focusedId: string, delta: -1 | 1): Workspace {
  const focused = workspace.threads.find((thread) => thread.id === focusedId)
  if (!focused) return workspace

  const hosts = workspace.threads.filter((thread) => !thread.terminal)
  const attachments = workspace.threads.filter((thread) => thread.terminal)

  if (!focused.terminal) {
    const from = hosts.findIndex((host) => host.id === focused.id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= hosts.length) return workspace
    const reordered = hosts.slice()
    ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
    return { ...workspace, threads: [...reordered, ...attachments] }
  }

  const meta = focused.attachment
  if (!meta) return workspace
  const hostIndex = hosts.findIndex((host) => host.id === meta.hostId)
  if (hostIndex === -1) return workspace

  const crossing = (delta === -1 && meta.side === 'right') || (delta === 1 && meta.side === 'left')
  if (crossing) {
    const side = delta === -1 ? 'left' : 'right'
    return patchAttachment(workspace, focused.id, meta.hostId, side)
  }

  const target = hosts[hostIndex + delta]
  if (!target || attachmentFor(workspace, target.id)) return workspace
  const side = delta === -1 ? 'right' : 'left'
  return patchAttachment(workspace, focused.id, target.id, side)
}

function patchAttachment(
  workspace: Workspace,
  terminalId: string,
  hostId: string,
  side: 'left' | 'right',
): Workspace {
  return {
    ...workspace,
    threads: workspace.threads.map((thread) =>
      thread.id === terminalId && thread.attachment
        ? { ...thread, attachment: { ...thread.attachment, hostId, side } }
        : thread,
    ),
  }
}
