---
name: mailcli
description: Use this skill for any request about email operations via CLI, including mailcli usage, IMAP/SMTP setup, inbox triage, searching/reading/sending mail, draft flows, attachment download, mailbox management, and mail troubleshooting. Trigger even when users do not explicitly say "mailcli" but clearly want command-line email workflows.
---

# Mailcli Skill

Use this skill to run reliable, repeatable `mailcli` workflows for email operations.
在用户需要通过命令行处理邮件任务时，使用此技能进行稳定、可复用的命令编排与执行。

## Trigger Rules / 触发规则

Use this skill when the user asks about:
- `mailcli` commands or setup
- IMAP/SMTP authentication and mailbox operations
- keychain/keyring backend setup and credential storage behavior
- inbox listing, searching, reading, moving, deleting, tagging
- sending email, replying, draft save/list/send
- downloading attachments
- troubleshooting email CLI failures

以下中文意图也应触发本技能：
- 邮件 CLI 使用、邮箱命令行管理
- IMAP/SMTP 配置、鉴权、密钥口令
- Keychain/Keyring 后端与口令存储策略
- 收件箱查询、搜索、读信、移动、删除、打标
- 发信、回复、草稿、附件下载
- mailcli 报错排障

## Installation / 安装与初始化

Read [install.md](references/install.md) before first use.
首次使用前先阅读 [install.md](references/install.md)。

Default install command:

```bash
npm install -g @yupingwang/mailcli
```

## Execution Policy / 执行策略

- Always use `mailcli` as the command entrypoint.
- Prefer direct execution for the user task; avoid unnecessary confirmation loops.
- Validate parameters before executing risky or state-changing commands.
- Keep commands explicit and reproducible in output.

- 固定使用 `mailcli` 作为入口命令。
- 默认直接执行，避免不必要的确认回合。
- 对高风险或写操作命令先做参数校验。
- 输出时保留可复现的命令文本。

## Core Workflow / 核心流程

1. Identify the operation category.
2. Load the relevant reference file(s) only.
3. Build command(s) with `scripts/build_mailcli_cmd.sh` when helpful.
4. Validate argument constraints with `scripts/validate_mailcli_args.sh`.
5. Execute command(s), then summarize result and next action.

1. 识别任务类型。
2. 仅加载相关 reference 文件。
3. 必要时用 `scripts/build_mailcli_cmd.sh` 生成命令。
4. 用 `scripts/validate_mailcli_args.sh` 校验参数约束。
5. 执行命令并汇总结果与下一步。

## Command Rules / 命令规则

- Respect runtime behavior from the project implementation.
- For `send`:
  - `--reply-all` requires `--reply-uid`
  - `--quote` requires `--reply-uid`
  - `--body` and `--body-file` are mutually exclusive
  - At least one recipient is required (unless inferred from reply flow)
  - A message body (plain/html/quote result) is required
- For UID operations (`read`, `delete`, `move`, `tag`, `draft send`, `attachments download`), UID must be a positive integer.
- For `auth login`, omitted fields are interactive in TTY mode; in non-interactive mode defaults are used where available and required fields must be passed explicitly.
- `auth keychain-init` is a macOS Keychain probe command and requires keychain backend enabled.

- 严格遵循项目中的真实运行语义。
- `send` 命令需满足 reply 依赖、正文参数互斥、收件人和正文约束。
- UID 类操作必须使用正整数 UID。
- `auth login` 在 TTY 下支持缺省参数交互输入；非交互场景必须显式提供缺失必填参数。
- `auth keychain-init` 用于初始化 Keychain 访问授权（需启用 keychain backend）。

## Output Contract / 输出约定

Always produce output in this order:

1. Intent / 任务意图（1 句）
2. Commands / 执行命令（可多条）
3. Result / 执行结果摘要
4. Recovery / 失败时修复动作（仅失败时）

Template:

```text
Intent: ...
Commands:
- ...
Result: ...
Recovery: ...
```

## Reference Routing / 参考资料路由

- For install and environment setup: read [install.md](references/install.md)
- For command syntax/options: read [commands.md](references/commands.md)
- For end-to-end task execution: read [workflows.md](references/workflows.md)
- For error diagnosis and fixes: read [troubleshooting.md](references/troubleshooting.md)

- 安装与环境初始化：读取 [install.md](references/install.md)
- 命令参数与语法：读取 [commands.md](references/commands.md)
- 任务闭环流程：读取 [workflows.md](references/workflows.md)
- 故障诊断修复：读取 [troubleshooting.md](references/troubleshooting.md)

## Safety Boundaries / 安全边界

- Do not fabricate unsupported subcommands or options.
- Do not expose secrets in output; redact passwords unless user explicitly asks.
- Prefer minimal-change command sequences for mailbox mutations.

- 不虚构未实现的子命令或参数。
- 不在输出中泄露敏感信息；密码默认脱敏。
- 写操作使用最小化变更序列，避免误删误移。
