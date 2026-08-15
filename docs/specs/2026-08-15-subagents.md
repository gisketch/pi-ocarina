# Spec: Subagents

Status: **NEED GRILLING** — not approved. The open questions at the end must be
answered with `$sonata-grill` before anyone implements this. Everything above
them is groundwork, not a settled contract.

Visual truth: `PiOcarina Components.dc.html` §11 (nested spines, parallel).
Behavior truth: this file, once approved.

## Problem & Outcome

The design shows `agent` rows with child tool calls nested one level under them,
and parallel subagents updating as sibling rows. The reducer nests them, the
renderer indents them, and fixtures cover both. Nothing produces them, because
**pi 0.84 has no agent or task tool**, and its tool events carry no parent
reference at all.

So subagents are ours to build. Outcome: the agent can hand a scoped piece of
work to a child agent, and the user watches that child's tool calls appear
nested under the row that started them.

## What pi gives us

Verified against `@earendil-works/pi-coding-agent@0.84.2`:

- `pi.registerTool(definition)` registers a custom tool. A subagent is a tool
  whose `execute` runs a child `AgentSession` and resolves with its result.
- `ToolDefinition.executionMode: 'parallel'` lets several run at once, which is
  what the design's sibling rows show.
- `execute` receives an `AbortSignal`, so cancelling the parent turn can cancel
  its children.
- `createAgentSession` already builds a session per thread. A child is the same
  call with a different prompt and, presumably, a narrower tool set.
- `ToolExecutionStartEvent` has no parent field. The nesting therefore comes
  from **us**: the tool knows its own `toolCallId`, so it can relay the child's
  events with that id as `parentId`. The vocabulary already carries `parentId`.

## In Scope

The subagent tool definition, how a child session is created and configured, how
its events reach the parent thread as nested rows, cancellation, and how its
work is reported back to the parent model.

## Out of Scope

The nesting rule and its rendering (thread-ledger spec, built and tested: one
level deep, a grandchild is adopted by the grandparent).

## Groundwork

The event vocabulary already carries `tool-start.parentId`, and the reducer
nests, settles children independently, and adopts orphans. `agent` is already a
`ToolKind`. The seam does not need to change — only to gain a producer.

## Risks

- **Approvals are the sharp edge.** A child agent that writes to disk must pass
  the same gate as its parent, and the gate is currently keyed on a thread id.
  A child that inherited a blanket approval, or bypassed the gate entirely,
  would be a real security regression.
- A child session writing its own session file would make it a thread in its own
  right, which the catalog and the strip would then list. That may be wanted or
  may be surprising.
- Runaway spawning: a child that can itself spawn children multiplies cost
  without a visible bound.

## Open questions — GRILL THESE

1. **Do child tool calls hit the approval gate?** If yes, whose workspace rules
   apply and where does the card appear — in the parent thread? If no, say why
   that is safe.
2. **Can a child spawn a child?** The renderer nests one level. If children can
   spawn, the tree and the display disagree.
3. **Does a child get its own session file?** If yes it becomes a listed thread;
   if no, its transcript lives only in the parent's rows and is lost on reopen.
   This decides whether replay can rebuild nested rows at all.
4. **What tools does a child get?** The same set, a read-only set, or a set the
   parent names?
5. **Model and reasoning**: inherited from the parent thread, or chosen per
   child? A cheap child for a mechanical sweep is the obvious use.
6. **How many run at once?** A hard cap, and what the model is told when it hits
   one.
7. **What does the parent model receive back** — the child's full transcript, a
   summary, or a structured result?
8. **Cancellation and cost.** Does cancelling the parent turn cancel children?
   Do their tokens appear in the parent thread's usage figures?
