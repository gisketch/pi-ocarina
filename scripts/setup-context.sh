#!/usr/bin/env bash
set -euo pipefail

echo "Sonata context setup"

if command -v pi >/dev/null 2>&1; then
  echo "Pi detected"
  echo "Project Pi skills and prompts live under .pi/"
else
  echo "Pi selected, but pi command was not found."
fi
