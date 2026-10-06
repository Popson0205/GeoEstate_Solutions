#!/usr/bin/env bash
set -euo pipefail

DIR="/c/Users/Popoola Idris/Downloads/Compressed/GeoEstate_LandCheck_MVP_v0_15/GeoEstate_LandCheck_MVP_v0_15"
REPO="https://github.com/Popson0205/GeoEstate_Solutions.git"
BRANCH="main"
MSG="v0.15: ALOS slope + flood susceptibility (terrain model + GEE evidence)"

cd "$DIR"

# Keep build output and secrets out of the repo
if [ ! -f .gitignore ]; then
  printf 'node_modules/\n.next/\n.env\n.env.local\n*.log\n.DS_Store\n' > .gitignore
fi

FRESH=0
if [ ! -d .git ]; then
  git init
  FRESH=1
fi

git checkout -B "$BRANCH"

if git remote | grep -qx origin; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi

git fetch origin

REMOTE_HAS_BRANCH=0
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  REMOTE_HAS_BRANCH=1
fi

# Fresh folder: build on top of the existing GitHub history, keeping this folder's files as they are
if [ "$FRESH" = 1 ] && [ "$REMOTE_HAS_BRANCH" = 1 ]; then
  git reset --soft "origin/$BRANCH"
fi

git add -A

if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -m "$MSG"
fi

if [ "$FRESH" = 0 ] && [ "$REMOTE_HAS_BRANCH" = 1 ]; then
  git pull --rebase origin "$BRANCH"
fi

git push -u origin "$BRANCH"
echo
echo "Pushed to $REPO ($BRANCH)"