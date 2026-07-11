# 06 — Shared Pi auth and model catalog

**What to build:** Show the providers and models available to the selected workspace using upstream Pi configuration as the only source of truth.

**Blocked by:** 03 — Versioned Rust-agent-host bridge; 05 — Native workspace catalog

**Status:** complete

- [x] The host reads upstream Pi auth.json, models.json, environment credentials, and built-in models using official SDK services.
- [x] No credential value is copied into Rust state or exposed to React.
- [x] Provider/model state refreshes when the first workspace opens and when upstream configuration changes.
- [x] Unavailable or invalid upstream configuration produces actionable non-secret errors.
