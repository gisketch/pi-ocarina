# 09 — Stop, failure, and runtime prompts

**What to build:** Give users safe control over active runs and surface failures, login requests, and attention prompts without leaving sessions stuck.

**Blocked by:** 07 — Create thread and stream a real run

**Status:** complete

- [x] Stop cancels the intended run and the composer becomes usable again.
- [x] Provider, tool, host, and validation failures render actionable states without leaking secrets.
- [x] Supported runtime input/login dialogs resolve or reject only the requesting session.
- [x] Closing or canceling a prompt cannot block unrelated sessions or corrupt the transcript.
