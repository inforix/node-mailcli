import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import process from "node:process";
import { loadRuntimeConfig } from "./config-loader.js";
import { saveConfig, validateConfig } from "../config/config.js";
import {
  getPassword,
  getSecretBackend,
  initializeKeychainAccess,
  promptHidden,
  setPassword,
  SecretNotFoundError
} from "../secrets/store.js";
import { AuthConfig } from "../types/config.js";

function isChanged(cmd: Command, optionName: string): boolean {
  return cmd.getOptionValueSource(optionName) !== undefined;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptText(optionName: string, label: string, defaultValue: string): Promise<string> {
  if (!isInteractive()) {
    if (defaultValue) {
      return defaultValue;
    }
    throw new Error(`--${optionName} is required when running without an interactive terminal`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      const answer = (await rl.question(`${label}${suffix}: `)).trim();
      if (answer) {
        return answer;
      }
      if (defaultValue) {
        return defaultValue;
      }
      console.log(`${label} is required.`);
    }
  } finally {
    rl.close();
  }
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

async function promptPort(optionName: string, label: string, defaultValue: number): Promise<number> {
  if (!isInteractive()) {
    return defaultValue;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (await rl.question(`${label} [${defaultValue}]: `)).trim();
      if (!answer) {
        return defaultValue;
      }
      const parsed = parsePositiveInt(answer);
      if (parsed !== undefined) {
        return parsed;
      }
      console.log(`${label} must be a positive integer.`);
    }
  } finally {
    rl.close();
  }
}

function parseBoolean(answer: string): boolean | undefined {
  const normalized = answer.trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  return undefined;
}

async function promptBool(optionName: string, label: string, defaultValue: boolean): Promise<boolean> {
  if (!isInteractive()) {
    return defaultValue;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const hint = defaultValue ? "[Y/n]" : "[y/N]";
      const answer = (await rl.question(`${label} ${hint}: `)).trim();
      if (!answer) {
        return defaultValue;
      }
      const parsed = parseBoolean(answer);
      if (parsed !== undefined) {
        return parsed;
      }
      console.log("Please answer yes or no.");
    }
  } finally {
    rl.close();
  }
}

async function promptPassword(existingPassword: string): Promise<{ password: string; changed: boolean }> {
  if (!isInteractive()) {
    if (existingPassword) {
      return { password: existingPassword, changed: false };
    }
    throw new Error("--password is required when running without an interactive terminal");
  }

  while (true) {
    const label = existingPassword ? "Password (leave empty to keep current): " : "Password: ";
    const entered = await promptHidden(label);

    if (entered) {
      return { password: entered, changed: true };
    }

    if (existingPassword) {
      return { password: existingPassword, changed: false };
    }

    console.log("Password is required.");
  }
}

async function resolveExistingPassword(username: string, currentUsername: string, currentPassword: string, currentSource: AuthConfig["passwordSource"]): Promise<{ password: string; source: AuthConfig["passwordSource"] }> {
  if (username === currentUsername && currentPassword) {
    return {
      password: currentPassword,
      source: currentSource ?? ""
    };
  }

  if (!username) {
    return { password: "", source: "" };
  }

  try {
    const password = await getPassword(username);
    return { password, source: "secrets" };
  } catch (err) {
    if (err instanceof SecretNotFoundError) {
      return { password: "", source: "" };
    }
    throw err;
  }
}

function requirePort(optionName: string, value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new Error(`--${optionName} must be a positive integer`);
  }
  return value;
}

export function newAuthCmd(): Command {
  const cmd = new Command("auth").description("Authentication and config setup");

  const login = new Command("login").description("Store IMAP/SMTP credentials and configuration");
  const keychainInit = new Command("keychain-init").description("Initialize macOS Keychain access");

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
    const currentUsername = cfg.auth.username;
    const currentPassword = cfg.auth.password ?? "";
    const currentPasswordSource = cfg.auth.passwordSource;

    cfg.imap.host = isChanged(login, "imapHost")
      ? (opts.imapHost ?? "")
      : await promptText("imap-host", "IMAP host", cfg.imap.host);

    cfg.imap.port = isChanged(login, "imapPort")
      ? requirePort("imap-port", opts.imapPort)
      : await promptPort("imap-port", "IMAP port", cfg.imap.port);

    cfg.imap.tls = isChanged(login, "imapTls")
      ? Boolean(opts.imapTls)
      : await promptBool("imap-tls", "Use IMAP TLS", cfg.imap.tls);

    cfg.imap.starttls = isChanged(login, "imapStarttls")
      ? Boolean(opts.imapStarttls)
      : await promptBool("imap-starttls", "Use IMAP STARTTLS", cfg.imap.starttls);

    cfg.imap.insecure_skip_verify = isChanged(login, "imapInsecure")
      ? Boolean(opts.imapInsecure)
      : await promptBool("imap-insecure", "Skip IMAP TLS verification", cfg.imap.insecure_skip_verify);

    const smtpHostDefault = cfg.imap.host;
    cfg.smtp.host = isChanged(login, "smtpHost")
      ? (opts.smtpHost ?? "")
      : await promptText("smtp-host", "SMTP host", smtpHostDefault);

    cfg.smtp.port = isChanged(login, "smtpPort")
      ? requirePort("smtp-port", opts.smtpPort)
      : await promptPort("smtp-port", "SMTP port", cfg.smtp.port);

    cfg.smtp.tls = isChanged(login, "smtpTls")
      ? Boolean(opts.smtpTls)
      : await promptBool("smtp-tls", "Use SMTP TLS", cfg.smtp.tls);

    cfg.smtp.starttls = isChanged(login, "smtpStarttls")
      ? Boolean(opts.smtpStarttls)
      : await promptBool("smtp-starttls", "Use SMTP STARTTLS", cfg.smtp.starttls);

    cfg.smtp.insecure_skip_verify = isChanged(login, "smtpInsecure")
      ? Boolean(opts.smtpInsecure)
      : await promptBool("smtp-insecure", "Skip SMTP TLS verification", cfg.smtp.insecure_skip_verify);

    cfg.auth.username = isChanged(login, "username")
      ? (opts.username ?? "")
      : await promptText("username", "Username", cfg.auth.username);

    const existingPassword = await resolveExistingPassword(
      cfg.auth.username,
      currentUsername,
      currentPassword,
      currentPasswordSource
    );

    const passwordChangedByFlag = isChanged(login, "password");
    let passwordChanged = passwordChangedByFlag;

    if (passwordChangedByFlag) {
      if (!opts.password) {
        throw new Error("password is required");
      }
      cfg.auth.password = opts.password;
      cfg.auth.passwordSource = "flags";
    } else {
      const prompted = await promptPassword(existingPassword.password);
      cfg.auth.password = prompted.password;
      passwordChanged = prompted.changed;
      cfg.auth.passwordSource = prompted.changed ? "flags" : existingPassword.source;
    }

    cfg.defaults.drafts_mailbox = isChanged(login, "draftsMailbox")
      ? (opts.draftsMailbox ?? "")
      : await promptText("drafts-mailbox", "Drafts mailbox", cfg.defaults.drafts_mailbox);

    validateConfig(cfg);

    let secretBackend: Awaited<ReturnType<typeof getSecretBackend>> | undefined;
    if (passwordChanged && cfg.auth.password) {
      await setPassword(cfg.auth.username, cfg.auth.password);
      secretBackend = await getSecretBackend();
    }

    if (passwordChanged || cfg.auth.passwordSource === "secrets" || cfg.auth.passwordSource === "env") {
      cfg.auth.password = "";
    }

    const path = await saveConfig(cfg);
    console.log(`Config saved to ${path}`);
    if (passwordChanged) {
      if (secretBackend === "keychain") {
        console.log("Password stored in macOS Keychain.");
      } else {
        console.log("Password stored in encrypted file backend.");
      }
    }
  });

  keychainInit.action(async () => {
    await initializeKeychainAccess();
    console.log("Keychain access initialized.");
  });

  cmd.addCommand(login);
  cmd.addCommand(keychainInit);
  return cmd;
}
