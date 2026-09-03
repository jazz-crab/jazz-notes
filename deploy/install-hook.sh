#!/usr/bin/env bash
# Install the post-receive hook into a bare git repository.
#
# Usage:
#   ./install-hook.sh [BARE_REPO]
#
# BARE_REPO defaults to ${JAZZ_BARE_REPO} or $HOME/jazz-notes-vault.git.
# After installation make sure the user running git-receive-pack (typically
# www-data for smart-HTTP) has write permission to both the bare repo and the
# vault directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BARE="${1:-${JAZZ_BARE_REPO:-$HOME/jazz-notes-vault.git}}"

if [ ! -d "$BARE" ]; then
  echo "error: bare repository does not exist: $BARE" >&2
  exit 1
fi

HOOKS_DIR="$BARE/hooks"
mkdir -p "$HOOKS_DIR"

install -m 755 "$SCRIPT_DIR/post-receive" "$HOOKS_DIR/post-receive"

echo "Installed post-receive hook → $HOOKS_DIR/post-receive"
echo
echo "Make sure the user that runs git-receive-pack (e.g. www-data) has:"
echo "  • write access to $BARE"
echo "  • write access to the vault directory"
echo
echo "Example:"
echo "  sudo chown -R www-data:www-data $BARE"
