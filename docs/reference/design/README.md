# Design Reference

Canonical UI reference, exported 2026-08-15 from Claude Design project
`04e5902c-e9d6-4b83-a265-ab3d784bb21e`.

- `PiOcarina v2.dc.html` — the full shell design (source of truth for layout,
  keyboard model, motion, and all chrome).
- `PiOcarina Components.dc.html` — the component library: 13 sections covering
  every building block (identity, primitives, type, messages, tool ledger,
  composer/statusbar, overlays, skeletons, model controls, composer extras,
  agent flow, navigation, git & shell).
- `support.js` — Claude Design's preview runtime (React-based `.dc.html`
  renderer). Reference only; never shipped. `.dc.html` templates use `{{ prop }}`
  bindings, `sc-if`/`sc-for` directives, and a `DCLogic` class in a
  `text/x-dc` script. Open the files in the Claude Design app to preview.

These files are design artifacts, not app code. The app re-implements them in
Svelte 5. When implementation and reference disagree, the reference wins on
visuals; specs under `docs/specs/` win on behavior.
