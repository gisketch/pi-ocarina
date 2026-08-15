# Quality

Keep this as the project verification menu. Add commands only after they pass locally.

## Harness Checks

| Check | Command | Run When |
|---|---|---|
| Harness structure and source size | `./scripts/check-sonata.sh` | After harness, docs, or skill changes |
| Optional changed-code gates | `node scripts/check-quality-gates.mjs` | Before handoff when SCC or Skylos is enabled |

## Project Checks

| Check | Command | Status |
|---|---|---|
| Bootstrap/install | `pnpm install` | verified |
| Run application | `pnpm dev` (electron-vite dev, HMR) | verified |
| Fast code checks | `pnpm check` (svelte-check + tsc) | verified |
| Unit tests | `pnpm test` (vitest) | verified |
| Build | `pnpm build` (main + preload + renderer → `dist/`) | verified |
| Visual review vs reference | `pnpm dev:web` on :5273, compare with `docs/reference/design/` | verified |
| Observe failures | Electron DevTools console + main-process stdout | verified |
| Reset/cleanup | Quit app; delete `~/Library/Application Support/PiOcarina/catalog.json` | verified |

Notes:

- `pnpm dev:web` runs the renderer alone in a browser (no Electron APIs) purely for
  visual comparison against the design reference. Animation smoothness cannot be
  judged there — a headless pane never composites, so transitions do not advance;
  judge motion in the real Electron window.
- Electron's binary occasionally extracts incompletely on install; if `pnpm dev`
  reports "Electron failed to install correctly", re-run `pnpm install`.

## Risk Lanes

- Fast: docs, copy, styling, scaffolding, one-line config. One cheap check; no test required.
- Behavior: branches, parsing, state transitions, regression fixes. One public-seam test plus relevant build/typecheck.
- Critical: persistence, concurrency, security, permissions, money, external contracts. Focused integration evidence and review.
- Milestone: broad or cross-cutting work. All relevant verified checks.

## Quality Bar

- Acceptance behavior exists before broad implementation.
- Validation is reproducible by another agent.
- Planned commands stay marked planned until verified.
- Source files above 350 lines fail the smell check. Required exceptions live in `.sonata/large-files.txt`, never product code.
- New decisions update durable repo context.
- Repeated failures become docs, checks, fixtures, logs, or clearer boundaries.
