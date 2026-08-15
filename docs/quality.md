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
| Bootstrap/install | `pnpm install` | planned |
| Run application | `pnpm dev` (electron-vite dev, HMR) | planned |
| Fast code checks | `pnpm check` (svelte-check + tsc) | planned |
| Exercise primary behavior | Launch shell; verify keyboard nav (`1–3`, `h/l`, leader, `⌘K`) | planned |
| Observe failures | Electron DevTools console + main-process stdout | planned |
| Reset/cleanup | Quit app; `rm -rf node_modules` + `pnpm install` | planned |

Greenfield: commands stay `planned` until the scaffold exists and each passes locally.

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
