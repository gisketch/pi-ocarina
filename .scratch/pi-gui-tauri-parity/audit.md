# beta.32 parity audit

Frozen source: `../pi-gui` at `7bed8a9ed969905cf0f4dc1c5eaa84d2ce1ab841`.

## Result

- Included flows: 202
- Passing: 202
- Failing: 0
- Unverified: 0
- Excluded rows: 4 update-checker scenarios
- Exclusion groups: update checking; website/video/Homebrew; signing/notarization/DMG/Linux/Windows; standalone computer-use; pi-gui app-state migration

`bun run audit:parity` verifies unique IDs, one valid owner per included row, a documented acceptance check per row, and completed blockers 01–42.

## Quality evidence

- `./scripts/check-sonata.sh && ./scripts/check-context.sh`
- `bun run check`
- `bun run test:agent-host`
- `bun run test:e2e`
- `bun run package:macos && bun run test:packaged`

The packaged smoke uses Finder's minimal PATH, discovers a workspace extension, reads real upstream auth, executes a real provider turn, reopens its Pi transcript, and launches/relaunches the `.app`. Native folder selection is owned by Ticket 05's real-Tauri acceptance; real PTY cwd/input is owned by Ticket 24's Rust check. Both capabilities are compiled into the same packaged binary exercised by the smoke.

## Intentional exclusions confirmed

No updater, website/video pipeline, Homebrew flow, signing, notarization, DMG, Linux/Windows target, standalone computer-use feature, or pi-gui app-state migration ships in this backlog.
