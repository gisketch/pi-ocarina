# Run Work Disclosure and Final Handoff

## Problem and Desired Outcome

Pi Ocarina currently renders streamed assistant text and semantic tool calls directly into the transcript without one run-level boundary. The user cannot distinguish the agent's working process from its final handoff, and completed work remains visually expanded even after the agent settles.

Present each submitted agent run as two coordinated parts:

- A disclosure containing provider-returned thinking summaries, commentary, intermediate text, and tool activity. It is expanded while work is active and collapses to a duration label when the run settles.
- A final assistant handoff rendered outside the disclosure as the normal transcript response.

Use explicit provider phase metadata when Pi exposes it. Use Pi's agent, turn, message, and tool lifecycle as a provider-neutral fallback.

## In Scope

- Forward the Pi agent, turn, message, thinking, text, and tool lifecycle required to identify one complete run.
- Preserve assistant content ordering and content indexes across streamed updates.
- Preserve explicit `commentary` and `final_answer` text phases exposed by compatible OpenAI Responses models.
- Group provider-returned thinking summaries, commentary, intermediate assistant text, and semantic tool calls inside one run disclosure.
- Render the final handoff outside the disclosure without duplicated or flashing content.
- Measure run duration from agent start through terminal settlement.
- Persist compact run-boundary and timing metadata in the Pi session so completed disclosures survive reopening without duplicating assistant or tool content.
- Accessible disclosure controls, active and terminal labels, reduced-motion behavior, and Cosmos fixtures.

## Out of Scope

- Exposing private chain-of-thought, encrypted reasoning payloads, redacted reasoning, or any reasoning the provider does not return as visible summary text.
- Generating a second model-written summary of the work process.
- Replacing the existing semantic tool-call renderer or tool lifecycle.
- Reconstructing exact durations for sessions completed before this feature records run metadata.
- Depending on OpenAI-only phases for correctness.
- Persisting transient token deltas or maintaining a competing transcript database.

## Acceptance Criteria

- Submitting a prompt creates one run disclosure associated with that user turn.
- The disclosure opens when the agent starts. Provider-returned thinking summaries, commentary, intermediate text, and tool activity appear inside it in Pi event order.
- The active disclosure communicates that work is ongoing and exposes an updating elapsed duration without causing transcript layout churn every token.
- A user may collapse or reopen the active disclosure. Subsequent deltas do not override that choice.
- Explicit `commentary` text remains inside the disclosure. Explicit `final_answer` text renders as the final assistant handoff outside it.
- Text whose phase is not known while streaming may appear provisionally inside the disclosure. When its completed block is classified as `final_answer`, it moves to the handoff once, without duplicate text or a blank assistant bubble.
- When explicit phase metadata is absent, the final non-empty assistant text in the last turn that is not followed by tool execution becomes the handoff. Earlier assistant text remains process content.
- Thinking content is labeled and presented as provider-returned reasoning or thinking summary, never as private chain-of-thought.
- Tool calls retain their existing semantic rows, progressive details, running states, and per-tool disclosure state inside the run disclosure.
- On successful `agent_end`, the disclosure collapses to `Worked for {duration}` and the final handoff remains visible below it.
- Cancellation collapses to `Stopped after {duration}`. Failure collapses to `Failed after {duration}` and preserves the actionable failure message.
- Reopening a settled disclosure shows the ordered process content and tool calls. Reopening a thread restores the same run grouping and recorded duration for runs completed after this feature shipped.
- Keyboard activation, focus visibility, `aria-expanded`, status announcements, theme tokens, typography roles, and reduced-motion preferences match existing shared UI behavior.
- Missing, delayed, duplicated, malformed, or provider-specific events cannot duplicate transcript content, lose the final handoff, or leave a run permanently active.

## Implementation Constraints and Settled Decisions

- Pi remains authoritative for messages, content, tool results, and session order. React owns only disclosure view state.
- A run begins at `agent_start` and settles at `agent_end`, cancellation, or failure. Turns and messages are nested sequencing boundaries, not separate top-level disclosures.
- Classification priority is explicit phase first, lifecycle inference second. Explicit `commentary` and `final_answer` always win over fallback inference.
- OpenAI Responses phase metadata is provider capability, not a global assumption. Other providers use the same presentation through lifecycle inference.
- Consume structured accumulated assistant content from Pi message updates. Do not concatenate independent raw protocol fragments into a competing message model.
- Coalesce high-frequency thinking and text deltas before React rendering. Elapsed-time display updates at a bounded interval independent of token frequency.
- Keep provisional text keyed by run, turn, message, and content index so reclassification moves one stable block instead of copying it.
- Use the existing semantic tool-call reconciliation by tool-call ID. Run grouping wraps tool rows; it does not replace their presentation model.
- Completion collapses the run-level disclosure even when an individual tool detail was open. Reopening the run restores the tool's existing disclosure state.
- Persist only compact run metadata such as stable boundary identifiers, start time, end time, and outcome through a namespaced Pi custom session entry. Final assistant and tool content continue to come from normal Pi messages.
- Historical sessions without run metadata degrade to normal transcript rendering or an undated process disclosure; they do not receive invented durations.
- Duration formatting uses elapsed wall time rounded to whole seconds, with compact minute and second units.

## Validation Evidence

- Agent-host contract tests prove ordered forwarding of agent, turn, message, thinking, text, tool, cancellation, and settlement events with stable content indexes.
- Phase tests prove OpenAI `commentary` and `final_answer` metadata survives the adapter and explicit classification overrides fallback inference.
- Fallback classifier tests cover multi-turn tool runs, text-only runs, missing phases, empty final blocks, failures, cancellation, and malformed event order.
- Reconciliation tests prove provisional text moves to the final handoff without duplication and one run retains one stable disclosure.
- Persistence tests prove namespaced run metadata round-trips through Pi custom session entries while transcript content remains Pi-owned.
- Disclosure tests prove active auto-open, user-controlled active collapse, terminal auto-collapse, reopen behavior, accessible names, and reduced motion.
- Existing semantic tool-call lifecycle tests remain green inside the grouped presentation.
- Cosmos fixtures cover active thinking, active commentary, mixed tools, explicit final answer, inferred final answer, completed, stopped, failed, missing metadata, and reopened history.
- Frontend and agent-host typechecks, focused unit tests, production build, Cosmos export, and a real desktop smoke pass.
- Desktop smoke uses one compatible OpenAI Responses model to verify explicit phases and one phase-less fixture/provider path to verify fallback behavior.

## Risks and Open Questions

- Providers vary in whether they expose visible thinking summaries or text phases. Empty thinking is valid and must not create a blank process row.
- OpenAI may attach phase metadata only when a text block completes, so provisional placement must remain stable during reclassification.
- Extensions can enqueue follow-up messages near agent settlement. The run must not finalize until Pi emits the terminal agent boundary.
- Session metadata written during abnormal process termination may be incomplete. Reopening must settle or clearly mark an interrupted run rather than showing it as active forever.
- No product decision remains open for the first implementation slice.
