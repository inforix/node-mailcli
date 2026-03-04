# Command Reference

This reference matches the current implementation in `src/cli/*`.

## Root

```bash
mailcli --help
```

Top-level commands:
- `auth`
- `status`
- `inbox`
- `mail`
- `read`
- `search`
- `send`
- `draft`
- `delete`
- `move`
- `tag`
- `mailboxes`
- `attachments`
- `config`

## Auth

```bash
mailcli auth login [options]
mailcli auth keychain-init
```

Common options:
- `--imap-host <host>`
- `--imap-port <port>`
- `--imap-tls`
- `--imap-starttls`
- `--imap-insecure`
- `--smtp-host <host>`
- `--smtp-port <port>`
- `--smtp-tls`
- `--smtp-starttls`
- `--smtp-insecure`
- `--username <username>`
- `--password <password>`
- `--drafts-mailbox <name>`

Notes:
- `auth login` prompts interactively for omitted fields when running in TTY.
- In non-interactive mode, required missing values must be provided explicitly.
- `auth keychain-init` verifies macOS Keychain access by writing/reading/deleting a temporary secret.

## Status / Listing / Search

```bash
mailcli status
mailcli inbox list [--page N --page-size N --threads]
mailcli mail list [--mailbox NAME --page N --page-size N --threads]
mailcli search <query> [--mailbox NAME --page N --page-size N --threads]
```

Notes:
- `--threads` may fall back to message listing if server THREAD is unsupported.

## Read and mutate by UID

```bash
mailcli read <uid> [--mailbox NAME --html]
mailcli delete <uid> [--mailbox NAME]
mailcli move <uid> <destination-mailbox> [--mailbox SOURCE]
mailcli tag <uid> <tag> [--mailbox NAME]
```

UID must be a positive integer.

## Send

```bash
mailcli send [options]
```

Common options:
- `--to <csv>`
- `--cc <csv>`
- `--bcc <csv>`
- `--subject <subject>`
- `--body <text>`
- `--body-file <path|->`
- `--body-html <html>`
- `--reply-to <address>`
- `--reply-uid <uid>`
- `--reply-all`
- `--quote`
- `--reply-mailbox <mailbox>`
- `--attachment <path>` (repeatable)

Constraints:
- `--reply-all` requires `--reply-uid`
- `--quote` requires `--reply-uid`
- `--body` and `--body-file` are mutually exclusive
- Must have message body from plain/html/quote result
- Must have at least one recipient (explicit or inferred in reply flow)

## Draft

```bash
mailcli draft save [options]
mailcli draft list [--page N --page-size N]
mailcli draft send <uid> [--keep]
```

`draft save` options are mostly aligned with `send`.

## Mailboxes

```bash
mailcli mailboxes list
mailcli mailboxes create <name>
```

## Attachments

```bash
mailcli attachments download <uid> [--mailbox NAME --output DIR]
```

## Config

```bash
mailcli config show [--show-password]
mailcli config edit
```

Notes:
- `config show` hides password unless `--show-password`.
- `config edit` requires `EDITOR` environment variable.
