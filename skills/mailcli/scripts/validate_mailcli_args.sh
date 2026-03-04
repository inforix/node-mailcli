#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  validate_mailcli_args.sh <operation> [args...]

Examples:
  validate_mailcli_args.sh read 123
  validate_mailcli_args.sh send --to alice@example.com --body "hello"
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

is_positive_int() {
  [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

op="$1"
shift || true

case "$op" in
  status|inbox-list|mail-list|mailboxes-list|config-show|config-edit|auth-keychain-init)
    exit 0
    ;;
  search)
    [[ $# -ge 1 ]] || fail "search requires <query>"
    [[ -n "${1:-}" ]] || fail "search query cannot be empty"
    exit 0
    ;;
  read|delete|attachments-download|draft-send)
    [[ $# -ge 1 ]] || fail "$op requires <uid>"
    is_positive_int "${1:-}" || fail "uid must be a positive integer"
    exit 0
    ;;
  move|tag)
    [[ $# -ge 2 ]] || fail "$op requires <uid> and one required argument"
    is_positive_int "${1:-}" || fail "uid must be a positive integer"
    [[ -n "${2:-}" ]] || fail "second required argument cannot be empty"
    exit 0
    ;;
  mailboxes-create)
    [[ $# -ge 1 ]] || fail "mailboxes-create requires <name>"
    [[ -n "${1:-}" ]] || fail "mailbox name cannot be empty"
    exit 0
    ;;
  auth-login)
    # Keep auth validation permissive because existing config may already provide fields.
    exit 0
    ;;
  send|draft-save)
    has_body=0
    has_body_file=0
    has_body_html=0
    has_reply_uid=0
    has_reply_all=0
    has_quote=0
    has_recipients=0

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --to|--cc|--bcc)
          shift
          [[ $# -ge 1 ]] || fail "missing value after recipient option"
          [[ -n "${1:-}" ]] && has_recipients=1
          ;;
        --body)
          has_body=1
          shift
          [[ $# -ge 1 ]] || fail "missing value after --body"
          ;;
        --body-file)
          has_body_file=1
          shift
          [[ $# -ge 1 ]] || fail "missing value after --body-file"
          ;;
        --body-html)
          has_body_html=1
          shift
          [[ $# -ge 1 ]] || fail "missing value after --body-html"
          ;;
        --reply-uid)
          has_reply_uid=1
          shift
          [[ $# -ge 1 ]] || fail "missing value after --reply-uid"
          is_positive_int "${1:-}" || fail "reply uid must be a positive integer"
          ;;
        --reply-all)
          has_reply_all=1
          ;;
        --quote)
          has_quote=1
          ;;
      esac
      shift || true
    done

    if [[ "$has_body" -eq 1 && "$has_body_file" -eq 1 ]]; then
      fail "use either --body or --body-file"
    fi

    if [[ "$has_reply_all" -eq 1 && "$has_reply_uid" -eq 0 ]]; then
      fail "--reply-all requires --reply-uid"
    fi

    if [[ "$has_quote" -eq 1 && "$has_reply_uid" -eq 0 ]]; then
      fail "--quote requires --reply-uid"
    fi

    if [[ "$op" == "send" ]]; then
      if [[ "$has_recipients" -eq 0 && "$has_reply_uid" -eq 0 ]]; then
        fail "send requires recipients or reply context"
      fi

      if [[ "$has_body" -eq 0 && "$has_body_file" -eq 0 && "$has_body_html" -eq 0 && "$has_quote" -eq 0 ]]; then
        fail "send requires body/html/quote content"
      fi
    fi
    exit 0
    ;;
  *)
    fail "unsupported operation: $op"
    ;;
esac
