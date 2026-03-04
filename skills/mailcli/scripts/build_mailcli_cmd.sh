#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/validate_mailcli_args.sh"

usage() {
  cat <<'EOF'
Usage:
  build_mailcli_cmd.sh <operation> [args...]

Operations:
  auth-login
  auth-keychain-init
  status
  inbox-list
  mail-list
  search
  read
  send
  draft-save
  draft-list
  draft-send
  delete
  move
  tag
  mailboxes-list
  mailboxes-create
  attachments-download
  config-show
  config-edit

Examples:
  build_mailcli_cmd.sh read 123 --mailbox INBOX
  build_mailcli_cmd.sh send --to alice@example.com --body "hello"
EOF
}

quote_join() {
  local out=()
  local item
  for item in "$@"; do
    out+=("$(printf "%q" "$item")")
  done
  printf "%s\n" "${out[*]}"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

op="$1"
shift || true

"$VALIDATOR" "$op" "$@"

cmd=(mailcli)
case "$op" in
  auth-login)
    cmd+=(auth login "$@")
    ;;
  auth-keychain-init)
    cmd+=(auth keychain-init "$@")
    ;;
  status)
    cmd+=(status "$@")
    ;;
  inbox-list)
    cmd+=(inbox list "$@")
    ;;
  mail-list)
    cmd+=(mail list "$@")
    ;;
  search)
    query="$1"
    shift || true
    cmd+=(search "$query" "$@")
    ;;
  read)
    uid="$1"
    shift || true
    cmd+=(read "$uid" "$@")
    ;;
  send)
    cmd+=(send "$@")
    ;;
  draft-save)
    cmd+=(draft save "$@")
    ;;
  draft-list)
    cmd+=(draft list "$@")
    ;;
  draft-send)
    uid="$1"
    shift || true
    cmd+=(draft send "$uid" "$@")
    ;;
  delete)
    uid="$1"
    shift || true
    cmd+=(delete "$uid" "$@")
    ;;
  move)
    uid="$1"
    dest="$2"
    shift 2 || true
    cmd+=(move "$uid" "$dest" "$@")
    ;;
  tag)
    uid="$1"
    tag="$2"
    shift 2 || true
    cmd+=(tag "$uid" "$tag" "$@")
    ;;
  mailboxes-list)
    cmd+=(mailboxes list "$@")
    ;;
  mailboxes-create)
    name="$1"
    shift || true
    cmd+=(mailboxes create "$name" "$@")
    ;;
  attachments-download)
    uid="$1"
    shift || true
    cmd+=(attachments download "$uid" "$@")
    ;;
  config-show)
    cmd+=(config show "$@")
    ;;
  config-edit)
    cmd+=(config edit "$@")
    ;;
  *)
    echo "ERROR: unsupported operation: $op" >&2
    exit 1
    ;;
esac

quote_join "${cmd[@]}"
