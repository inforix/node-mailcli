# Install and Initialize

## 1. Install

```bash
npm install -g @yupingwang/mailcli
```

Verify installation:

```bash
mailcli --help
```

## 2. First-time configuration

Use `auth login` to save IMAP/SMTP config and credentials:

```bash
mailcli auth login \
  --imap-host imap.example.com \
  --imap-port 993 \
  --imap-tls \
  --smtp-host smtp.example.com \
  --smtp-port 587 \
  --smtp-starttls \
  --username you@example.com \
  --password your-app-password
```

`auth login` can also run interactively (omit some flags and answer prompts in TTY).

## 3. Keychain/Keyring backend behavior

By default:
- macOS: Keychain backend (`keyring_backend: keychain`)
- non-macOS: encrypted file backend (`keyring_backend: file`)

Initialize Keychain authorization on macOS:

```bash
mailcli auth keychain-init
```

When using encrypted file backend, `mailcli` may ask:

```text
Keyring password:
```

To avoid repeated prompts, set:

```bash
export MAILCLI_KEYRING_PASSWORD='your-keyring-passphrase'
```

## 4. Config paths

- Config file: `~/.config/mailcli/config.yaml`
- Encrypted file backend secrets: `~/.config/mailcli/keyring/secrets.json`

## 5. Environment overrides

Common environment variables:

```bash
MAILCLI_IMAP_HOST=imap.example.com
MAILCLI_SMTP_HOST=smtp.example.com
MAILCLI_AUTH_USERNAME=you@example.com
MAILCLI_AUTH_PASSWORD=app-password
MAILCLI_KEYRING_BACKEND=keychain
MAILCLI_KEYRING_PASSWORD=your-keyring-passphrase
```

Notes:
- `MAILCLI_AUTH_PASSWORD` bypasses secret lookup and uses env password directly.
- `MAILCLI_KEYRING_BACKEND` supports `file` or `keychain`.
