# 03 — Versioned Rust-agent-host bridge

**What to build:** Provide the narrow production bridge through which Rust supervises the Pi host and React receives validated command results and streamed lifecycle events.

**Blocked by:** 02 — Self-contained upstream Pi packaging proof

**Status:** complete

- [x] Every request and event carries a protocol version and request identifier and is validated at the receiving boundary.
- [x] Streaming events preserve order per request while independent requests can progress concurrently.
- [x] Cancellation reaches the active Pi operation and produces one terminal state.
- [x] Host crash, malformed output, startup failure, and app shutdown reject pending work clearly and allow a clean restart.
