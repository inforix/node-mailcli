import fs from "node:fs/promises";
import YAML from "yaml";
import { Config } from "../types/config.js";
import { configPath, ensureConfigDir } from "./paths.js";

function cloneConfig(cfg: Config): Config {
  return JSON.parse(JSON.stringify(cfg)) as Config;
}

export function defaultConfig(): Config {
  return {
    keyring_backend: "file",
    imap: {
      host: "",
      port: 993,
      tls: true,
      starttls: false,
      insecure_skip_verify: false
    },
    smtp: {
      host: "",
      port: 587,
      tls: false,
      starttls: true,
      insecure_skip_verify: false
    },
    auth: {
      username: ""
    },
    defaults: {
      drafts_mailbox: "Drafts"
    }
  };
}

function mergeConfig(base: Config, incoming: Partial<Config>): Config {
  return {
    ...base,
    ...incoming,
    imap: { ...base.imap, ...(incoming.imap ?? {}) },
    smtp: { ...base.smtp, ...(incoming.smtp ?? {}) },
    auth: { ...base.auth, ...(incoming.auth ?? {}) },
    defaults: { ...base.defaults, ...(incoming.defaults ?? {}) }
  };
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

function applyEnvOverrides(cfg: Config): Config {
  const out = cloneConfig(cfg);
  const setString = (value: string | undefined, setter: (v: string) => void) => {
    if (value !== undefined) {
      setter(value);
    }
  };
  const setInt = (value: string | undefined, setter: (v: number) => void) => {
    if (value === undefined) {
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      setter(parsed);
    }
  };
  const setBool = (value: string | undefined, setter: (v: boolean) => void) => {
    if (value !== undefined) {
      setter(parseBool(value));
    }
  };

  setString(process.env.MAILCLI_KEYRING_BACKEND, (v) => {
    out.keyring_backend = v;
  });

  setString(process.env.MAILCLI_IMAP_HOST, (v) => {
    out.imap.host = v;
  });
  setInt(process.env.MAILCLI_IMAP_PORT, (v) => {
    out.imap.port = v;
  });
  setBool(process.env.MAILCLI_IMAP_TLS, (v) => {
    out.imap.tls = v;
  });
  setBool(process.env.MAILCLI_IMAP_STARTTLS, (v) => {
    out.imap.starttls = v;
  });
  setBool(process.env.MAILCLI_IMAP_INSECURE_SKIP_VERIFY, (v) => {
    out.imap.insecure_skip_verify = v;
  });

  setString(process.env.MAILCLI_SMTP_HOST, (v) => {
    out.smtp.host = v;
  });
  setInt(process.env.MAILCLI_SMTP_PORT, (v) => {
    out.smtp.port = v;
  });
  setBool(process.env.MAILCLI_SMTP_TLS, (v) => {
    out.smtp.tls = v;
  });
  setBool(process.env.MAILCLI_SMTP_STARTTLS, (v) => {
    out.smtp.starttls = v;
  });
  setBool(process.env.MAILCLI_SMTP_INSECURE_SKIP_VERIFY, (v) => {
    out.smtp.insecure_skip_verify = v;
  });

  setString(process.env.MAILCLI_AUTH_USERNAME, (v) => {
    out.auth.username = v;
  });
  setString(process.env.MAILCLI_AUTH_PASSWORD, (v) => {
    out.auth.password = v;
  });

  setString(process.env.MAILCLI_DEFAULTS_DRAFTS_MAILBOX, (v) => {
    out.defaults.drafts_mailbox = v;
  });

  return out;
}

export async function loadConfigFile(): Promise<Config> {
  const path = configPath();
  let cfg = defaultConfig();
  try {
    const content = await fs.readFile(path, "utf8");
    const parsed = YAML.parse(content) as Partial<Config> | null;
    if (parsed && typeof parsed === "object") {
      cfg = mergeConfig(cfg, parsed);
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      throw err;
    }
  }
  return cfg;
}

export async function loadConfig(): Promise<Config> {
  const fromFile = await loadConfigFile();
  return applyEnvOverrides(fromFile);
}

export async function saveConfig(cfg: Config): Promise<string> {
  await ensureConfigDir();
  const path = configPath();
  const content = YAML.stringify(cfg);
  await fs.writeFile(path, content, { mode: 0o600 });
  return path;
}

export function redactConfig(cfg: Config): Config {
  const out = cloneConfig(cfg);
  if (out.auth.password) {
    out.auth.password = "****";
  }
  return out;
}

export function validateIMAP(cfg: Config): void {
  if (!cfg.imap.host) {
    throw new Error("imap.host is required");
  }
  if (!cfg.auth.username) {
    throw new Error("auth.username is required");
  }
  if (!cfg.auth.password) {
    throw new Error("auth.password is required");
  }
}

export function validateSMTP(cfg: Config): void {
  if (!cfg.smtp.host) {
    throw new Error("smtp.host is required");
  }
  if (!cfg.auth.username) {
    throw new Error("auth.username is required");
  }
  if (!cfg.auth.password) {
    throw new Error("auth.password is required");
  }
}

export function validateConfig(cfg: Config): void {
  validateIMAP(cfg);
  validateSMTP(cfg);
}
