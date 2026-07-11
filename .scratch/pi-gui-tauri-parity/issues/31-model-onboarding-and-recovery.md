# 31 — Model onboarding and recovery

**What to build:** Guide users from no usable provider/model to a runnable thread and recover when configured models become unavailable.

**Blocked by:** 29 — Provider credential settings

**Status:** complete

- [x] New-thread UI explains the missing-provider state and links directly to the relevant settings.
- [x] Selecting a usable model dismisses onboarding for that thread scope.
- [x] Refresh after provider configuration discovers and enables supported models without app restart.
- [x] Stale enabled-model indicators disappear when no provider supports them.

**Checks:** F048 and F050–F052 are covered by the live catalog derivation, focused availability recovery test, frontend checks, and desktop smoke.
