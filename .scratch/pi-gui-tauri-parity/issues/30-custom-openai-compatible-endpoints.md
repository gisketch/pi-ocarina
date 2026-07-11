# 30 — Custom OpenAI-compatible endpoints

**What to build:** Let users add, edit, and remove upstream-compatible custom endpoints with safe validation and clear ownership.

**Blocked by:** 29 — Provider credential settings

**Status:** ready-for-agent

- [ ] Endpoint name, provider identifier, base URL, credential reference, and supported model data persist through upstream Pi configuration.
- [ ] Colliding built-in or existing provider identifiers are rejected before writing.
- [ ] Only valid supported HTTP or HTTPS endpoint URLs are accepted according to the chosen security policy.
- [ ] Legacy managed entries and built-in overrides remain distinct and deletion does not remove unrelated credentials.

