# 29 — Provider credential settings

**What to build:** Let users manage upstream Pi provider credentials while clearly distinguishing stored, environment-managed, and externally configured sources.

**Blocked by:** 06 — Shared Pi auth and model catalog

**Status:** ready-for-agent

- [ ] Supported built-in provider credentials can be saved through upstream Pi auth storage without entering Rust state.
- [ ] Environment and models-file providers are displayed as externally managed and are not overwritten.
- [ ] Secrets are masked in UI, logs, events, tests, and errors.
- [ ] Provider/model state refreshes immediately after a successful change.

