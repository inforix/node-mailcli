# Workflows

## 1) Bootstrap account configuration

1. Install and verify:
```bash
npm install -g @yupingwang/mailcli
mailcli --help
```
2. Login and save config:
```bash
mailcli auth login --imap-host ... --smtp-host ... --username ... --password ...
```
3. (macOS + keychain backend) initialize keychain access once:
```bash
mailcli auth keychain-init
```
4. Validate connectivity:
```bash
mailcli status
mailcli inbox list --page 1 --page-size 20
```

## 2) Inbox triage flow

1. Check status:
```bash
mailcli status
```
2. List newest messages:
```bash
mailcli inbox list --page 1 --page-size 20
```
3. Search topic:
```bash
mailcli search "invoice" --mailbox INBOX --page 1 --page-size 20
```
4. Read target message:
```bash
mailcli read 12345 --mailbox INBOX
```

## 3) Send a new email

```bash
mailcli send \
  --to "alice@example.com,bob@example.com" \
  --subject "Project Update" \
  --body "Hello team, update attached." \
  --attachment ./report.pdf
```

Use `--body-file path.txt` for long bodies.

## 4) Reply / Reply-all flow

Reply to a message:

```bash
mailcli send --reply-uid 12345 --reply-mailbox INBOX --body "Thanks, received."
```

Reply-all with quote:

```bash
mailcli send --reply-uid 12345 --reply-all --quote --body "See inline response."
```

## 5) Draft flow

Save draft:

```bash
mailcli draft save --to "alice@example.com" --subject "Draft" --body "WIP"
```

List drafts:

```bash
mailcli draft list --page 1 --page-size 20
```

Send draft:

```bash
mailcli draft send 42
```

Send and keep draft:

```bash
mailcli draft send 42 --keep
```

## 6) Message lifecycle actions

Move:

```bash
mailcli move 12345 Archive --mailbox INBOX
```

Tag:

```bash
mailcli tag 12345 FollowUp --mailbox INBOX
```

Delete:

```bash
mailcli delete 12345 --mailbox INBOX
```

## 7) Attachment download

```bash
mailcli attachments download 12345 --mailbox INBOX --output ./attachments
```

## 8) Mailbox management

List:

```bash
mailcli mailboxes list
```

Create:

```bash
mailcli mailboxes create "Project X"
```
