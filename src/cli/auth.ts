import { Command } from "commander";
import { loadRuntimeConfig } from "./config-loader.js";
import { saveConfig, validateConfig } from "../config/config.js";
import { getPassword, setPassword, SecretNotFoundError } from "../secrets/store.js";

function isChanged(cmd: Command, optionName: string): boolean {
  return cmd.getOptionValueSource(optionName) !== undefined;
}

export function newAuthCmd(): Command {
  const cmd = new Command("auth").description("Authentication and config setup");

  const login = new Command("login").description("Store IMAP/SMTP credentials and configuration");

  login
    .option("--imap-host <host>", "IMAP host")
    .option("--imap-port <port>", "IMAP port", (v) => Number.parseInt(v, 10))
    .option("--imap-tls", "Use IMAP TLS")
    .option("--imap-starttls", "Use IMAP STARTTLS")
    .option("--imap-insecure", "Skip IMAP TLS verification")
    .option("--smtp-host <host>", "SMTP host")
    .option("--smtp-port <port>", "SMTP port", (v) => Number.parseInt(v, 10))
    .option("--smtp-tls", "Use SMTP TLS")
    .option("--smtp-starttls", "Use SMTP STARTTLS")
    .option("--smtp-insecure", "Skip SMTP TLS verification")
    .option("--username <username>", "Username")
    .option("--password <password>", "Password or app password")
    .option("--drafts-mailbox <name>", "Drafts mailbox name");

  login.action(async () => {
    const opts = login.opts<{
      imapHost?: string;
      imapPort?: number;
      imapTls?: boolean;
      imapStarttls?: boolean;
      imapInsecure?: boolean;
      smtpHost?: string;
      smtpPort?: number;
      smtpTls?: boolean;
      smtpStarttls?: boolean;
      smtpInsecure?: boolean;
      username?: string;
      password?: string;
      draftsMailbox?: string;
    }>();

    const cfg = await loadRuntimeConfig();
    const passwordChanged = isChanged(login, "password");
    const usernameChanged = isChanged(login, "username");

    if (isChanged(login, "imapHost")) cfg.imap.host = opts.imapHost ?? "";
    if (isChanged(login, "imapPort")) cfg.imap.port = opts.imapPort ?? 0;
    if (isChanged(login, "imapTls")) cfg.imap.tls = Boolean(opts.imapTls);
    if (isChanged(login, "imapStarttls")) cfg.imap.starttls = Boolean(opts.imapStarttls);
    if (isChanged(login, "imapInsecure")) cfg.imap.insecure_skip_verify = Boolean(opts.imapInsecure);

    if (isChanged(login, "smtpHost")) cfg.smtp.host = opts.smtpHost ?? "";
    if (isChanged(login, "smtpPort")) cfg.smtp.port = opts.smtpPort ?? 0;
    if (isChanged(login, "smtpTls")) cfg.smtp.tls = Boolean(opts.smtpTls);
    if (isChanged(login, "smtpStarttls")) cfg.smtp.starttls = Boolean(opts.smtpStarttls);
    if (isChanged(login, "smtpInsecure")) cfg.smtp.insecure_skip_verify = Boolean(opts.smtpInsecure);

    if (isChanged(login, "username")) cfg.auth.username = opts.username ?? "";
    if (isChanged(login, "draftsMailbox")) cfg.defaults.drafts_mailbox = opts.draftsMailbox ?? "";

    if (usernameChanged && !passwordChanged && (!cfg.auth.passwordSource || cfg.auth.passwordSource === "secrets")) {
      cfg.auth.password = "";
      cfg.auth.passwordSource = "";
      if (cfg.auth.username) {
        try {
          cfg.auth.password = await getPassword(cfg.auth.username);
          cfg.auth.passwordSource = "secrets";
        } catch (err) {
          if (!(err instanceof SecretNotFoundError)) {
            throw err;
          }
        }
      }
    }

    if (passwordChanged) {
      if (!opts.password) {
        throw new Error("password is required");
      }
      cfg.auth.password = opts.password;
      cfg.auth.passwordSource = "flags";
    }

    validateConfig(cfg);

    if (passwordChanged && opts.password) {
      await setPassword(cfg.auth.username, opts.password);
    }

    if (passwordChanged || cfg.auth.passwordSource === "secrets" || cfg.auth.passwordSource === "env") {
      cfg.auth.password = "";
    }

    const path = await saveConfig(cfg);
    console.log(`Config saved to ${path}`);
    if (passwordChanged) {
      console.log("Password stored in encrypted file backend.");
    }
  });

  cmd.addCommand(login);
  return cmd;
}
