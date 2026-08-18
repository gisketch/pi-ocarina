/** A pi thread's id, held apart from every other string that names a column.
 *
 *  The strip draws columns, and not every column is a thread. A workspace with
 *  nothing open draws a placeholder whose id is `fresh:<workspace>`, and every
 *  workspace can draw a shell whose id is `terminal:<workspace>`. Neither has a
 *  session behind it, and main answers a command for one by throwing
 *  `unknown thread` — or, worse, by recording state under an id that runs
 *  nothing and reporting success.
 *
 *  Both are strings, and `threadId` was a string, so every one of those
 *  crossings typechecked. This is the type that stops them: it is assignable to
 *  `string`, so main and every reader of an id keep working unchanged, and
 *  `string` is not assignable to it, so a column id cannot be spent as a thread
 *  id without saying where it came from.
 *
 *  Only two things mint one: pi, by way of `listThreads` and `createThread`,
 *  and `threadOf` in the renderer, which converts a column and answers null
 *  when the column is not a thread. */
export type ThreadId = string & { readonly isThreadId: unique symbol }

/** Names a thread id where there is no pi to mint one — tests, and fixtures.
 *
 *  Deliberately greppable, and deliberately not reachable from the app: every
 *  id the running app spends comes from `listThreads`, from `createThread`, or
 *  from `threadOf`, which answers null for a column that is not a thread. */
export function threadIdForTest(id: string): ThreadId {
  return id as ThreadId
}
