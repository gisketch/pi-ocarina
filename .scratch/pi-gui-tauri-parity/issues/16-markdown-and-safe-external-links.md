# 16 — Markdown and safe external links

**What to build:** Render assistant content clearly while preventing message content from navigating the app to unsafe or unsupported targets.

**Blocked by:** 08 — Tool-call timeline

**Status:** complete

- [x] Common Markdown, code blocks, and long unbroken content render within the timeline.
- [x] Known code languages receive syntax highlighting and unknown languages remain readable plain code.
- [x] HTTP and HTTPS links open through the native external browser action.
- [x] Non-web schemes and malformed links are refused without changing session state.
