# mailcli (Node.js)

A TypeScript/Node.js IMAP/SMTP CLI for generic mail servers.

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
npm run dev -- --help
```

After build:

```bash
node dist/index.js --help
```

## Config

Config file path:

```text
~/.config/mailcli/config.yaml
```

Environment variable overrides use `MAILCLI_` prefix:

```bash
MAILCLI_IMAP_HOST=imap.example.com
MAILCLI_SMTP_HOST=smtp.example.com
MAILCLI_AUTH_USERNAME=you@example.com
MAILCLI_AUTH_PASSWORD=app-password
MAILCLI_KEYRING_BACKEND=keychain
MAILCLI_KEYRING_PASSWORD=your-secret-passphrase
```

On macOS, passwords default to Keychain (`keyring_backend: keychain`). On other systems, passwords default to encrypted file backend (`keyring_backend: file`).

Encrypted file backend path:

```text
~/.config/mailcli/keyring/secrets.json
```

## Commands

```bash
mailcli auth login --imap-host ... --smtp-host ... --username ... --password ...
mailcli auth keychain-init
mailcli status
mailcli inbox list --page 1 --page-size 20
mailcli mail list --mailbox Archive
mailcli search "invoice" --mailbox INBOX
mailcli read 12345
mailcli send --to "alice@example.com" --subject "Hi" --body "Hello"
mailcli draft save --to "alice@example.com" --subject "Draft" --body "WIP"
mailcli draft list
mailcli draft send 42
mailcli delete 12345
mailcli move 12345 Archive
mailcli tag 12345 FollowUp
mailcli mailboxes list
mailcli mailboxes create "Project X"
mailcli attachments download 12345 --output ./attachments
mailcli config show
mailcli config edit
```

`mailcli auth login` supports interactive setup: if a flag is omitted, it prompts for that field. When `--smtp-host` is omitted, the prompt defaults to the resolved IMAP host.
`mailcli auth keychain-init` runs a macOS Keychain write/read/delete probe to initialize Keychain access.

## Compatibility Notes

- Command shape and flags follow the Go `mailcli` baseline.
- `auth keyring` is intentionally removed in this Node implementation.
- `--threads` currently falls back to message listing when server-side thread API is unavailable.

## Publish to npm

GitHub Actions workflow: `.github/workflows/publish-npm.yml`

1. Configure repository secret `NPM_TOKEN` (npm automation token with publish permission).
2. Bump version in `package.json`.
3. Create and push tag in format `v<package-version>`, for example `v0.1.1`.

Workflow will run `lint`, `test`, `build`, then publish to npmjs.
