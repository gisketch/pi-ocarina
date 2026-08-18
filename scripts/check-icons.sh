#!/usr/bin/env bash
# Icons are icons; unicode is text.
#
# Every mark the UI draws comes from the registry in `src/renderer/src/lib/
# icons.ts`, through `<Icon>`. A glyph written inline is the thing this
# replaced: coverage differs by platform font, weights do not match, and the
# same idea gets drawn two ways in two places with nobody the wiser.
#
# What stays, and is not matched below: `·` and `…`, which are punctuation; the
# key caps (`⏎`, `⌘`, `⇧`, `⌥`), which are the glyph printed on the key; and
# the ledger's `■` status nodes and the `■ PI` label, which the design draws as
# shapes rather than as icons — `■` is therefore not in the list below.
set -euo pipefail

cd "$(dirname "$0")/.."

# Alternation, not a bracket class: a character class of multibyte glyphs
# matches byte-wise under some locales and flagged every em dash in the repo.
BANNED='▸|▾|▤|⑂|↗|▣|□|✗|✓'

hits=$(grep -rnE "$BANNED" src/renderer/src/components --include='*.svelte' 2>/dev/null \
  | grep -vE '^\s*[^:]+:[0-9]+: *(\*|//|/\*)' \
  || true)

if [ -n "$hits" ]; then
  echo "unicode drawn as an icon — use <Icon name=…> and the registry:"
  echo "$hits"
  exit 1
fi

echo "icons ok"
