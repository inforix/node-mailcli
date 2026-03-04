# Troubleshooting

Use this map to classify errors quickly and recover with minimal steps.

## `auth.password is required`

Cause:
- Password not available from config, env, or secrets.

Fix:
```bash
mailcli auth login --username you@example.com --password your-app-password
```
Or:
```bash
export MAILCLI_AUTH_PASSWORD='your-app-password'
```

## `imap.host is required` or `smtp.host is required`

Cause:
- Missing host config for required protocol.

Fix:
```bash
mailcli auth login --imap-host imap.example.com --smtp-host smtp.example.com
```

## `failed to decrypt secret; check MAILCLI_KEYRING_PASSWORD`

Cause:
- Wrong keyring passphrase for encrypted secret file.

Fix:
```bash
export MAILCLI_KEYRING_PASSWORD='correct-keyring-passphrase'
```

If forgotten, reset by re-running login with new password and passphrase flow.

## `keychain backend is not enabled; set keyring_backend to 'keychain'`

Cause:
- Running `mailcli auth keychain-init` while backend is `file`.

Fix:
```bash
export MAILCLI_KEYRING_BACKEND=keychain
mailcli auth keychain-init
```

## `security command failed: ... The authorization was canceled by the user`

Cause:
- macOS Keychain authorization dialog was denied/canceled.

Fix:
- Re-run and approve the prompt (prefer “Always Allow” for smoother repeated CLI use).
- Then run:
```bash
mailcli auth keychain-init
```

## `no TTY available for keyring password prompt; set MAILCLI_KEYRING_PASSWORD`

Cause:
- Running non-interactive command that requires secret decryption.

Fix:
```bash
export MAILCLI_KEYRING_PASSWORD='your-keyring-passphrase'
```

## `Server does not support THREAD; showing messages instead.`

Cause:
- IMAP server does not support THREAD extension.

Fix:
- Informational only. Command already falls back to message list/search.
- Optionally remove `--threads` to avoid warning.

## `invalid uid: ...`

Cause:
- UID is non-numeric or not a positive integer.

Fix:
- Use a positive integer UID from list/search/read output.

## `--reply-all requires --reply-uid`

Cause:
- Reply-all used without target message UID.

Fix:
```bash
mailcli send --reply-uid 12345 --reply-all --body "..."
```

## `--quote requires --reply-uid`

Cause:
- Quote mode enabled without target message UID.

Fix:
```bash
mailcli send --reply-uid 12345 --quote --body "..."
```

## `use either --body or --body-file`

Cause:
- Both text-body sources provided simultaneously.

Fix:
- Keep only one of:
  - `--body "text"`
  - `--body-file ./body.txt`

## `message body required ...`

Cause:
- Send called with no plain body, no html body, and no quote-generated body.

Fix:
- Provide one:
  - `--body ...`
  - `--body-file ...`
  - `--body-html ...`
  - or use `--quote` with `--reply-uid`.

## `at least one recipient is required`

Cause:
- No recipients in `to/cc/bcc` and not inferred from reply context.

Fix:
- Add recipients, e.g.:
```bash
mailcli send --to "alice@example.com" --subject "Hi" --body "Hello"
```

## `EDITOR not set; config file is ...`

Cause:
- `mailcli config edit` needs `EDITOR` env.

Fix:
```bash
export EDITOR=vim
mailcli config edit
```
