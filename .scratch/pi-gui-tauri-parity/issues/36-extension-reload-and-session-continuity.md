# 36 — Extension reload and session continuity

**What to build:** Reload Pi resources and extension packages without duplicate subscriptions, stale dock state, or lost child-session editor updates.

**Blocked by:** 33 — Extension discovery and management; 34 — Extension dock UI; 35 — Extension dialogs and compatibility fallback

**Status:** complete

- [x] Reload and enable/disable transitions rebuild the intended runtime once and reset transient dock expansion.
- [x] Changed extension output appears after rebuild without app restart.
- [x] Extension-created child sessions can select a thread and prefill its draft through one subscription path.
- [x] Reload failure leaves the prior usable runtime or a clear recoverable state.
