#!/usr/bin/env bash
# Mirrors the Altspace creator SDK docs and the altspace.js bot SDK docs into reference/ as markdown.
# They're SideQuest's content, so they're downloaded locally rather than committed.
set -euo pipefail
cd "$(dirname "$0")/.."
CREATOR=https://raw.githubusercontent.com/SideQuestVR/BanterSDK/refs/heads/feature/greenfield/Docs
BOTS=https://altvr.app/bots/pages
mkdir -p reference/creator-sdk reference/bots-sdk
curl -fsSL "$CREATOR/README.md" -o reference/creator-sdk/README.md
curl -fsSL "$CREATOR/_sidebar.md" -o reference/creator-sdk/_sidebar.md
grep -oE '\(/[^)]+\.md\)' reference/creator-sdk/_sidebar.md | tr -d '()' | while read -r p; do
  mkdir -p "reference/creator-sdk$(dirname "$p")"; curl -fsSL "$CREATOR$p" -o "reference/creator-sdk$p"
done
curl -fsSL "$BOTS/README.md" -o reference/bots-sdk/README.md
curl -fsSL "$BOTS/_sidebar.md" -o reference/bots-sdk/_sidebar.md
grep -oE '\(/[^)]+\.md\)' reference/bots-sdk/_sidebar.md | tr -d '()' | while read -r p; do
  mkdir -p "reference/bots-sdk$(dirname "$p")"; curl -fsSL "$BOTS$p" -o "reference/bots-sdk$p"
done
echo "Fetched $(find reference -name '*.md' | wc -l | tr -d ' ') pages into reference/"
