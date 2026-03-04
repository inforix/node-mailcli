import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { loadConfig } from "../config/config.js";
import { ensureKeyringDir } from "../config/paths.js";

const KEYRING_PASSWORD_ENV = "MAILCLI_KEYRING_PASSWORD";
const KEYRING_BACKEND_ENV = "MAILCLI_KEYRING_BACKEND";
const KEYCHAIN_SERVICE = "mailcli";

type SecretBackend = "file" | "keychain";

export class SecretNotFoundError extends Error {
  constructor() {
    super("secret not found");
  }
}

type SecretEntry = {
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

type SecretFile = {
  version: 1;
  entries: Record<string, SecretEntry>;
};

class SecurityCommandError extends Error {
  code: number | null;
  stderr: string;

  constructor(message: string, code: number | null, stderr: string) {
    super(message);
    this.code = code;
    this.stderr = stderr;
  }
}

let cachedPassphrase: string | undefined;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function passwordKey(username: string): string {
  return `auth:password:${normalize(username)}`;
}

function parseBackend(raw: string | undefined): SecretBackend | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "file" || normalized === "keychain") {
    return normalized;
  }

  return undefined;
}

function parseRequiredBackend(name: string, raw: string | undefined): SecretBackend | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const parsed = parseBackend(raw);
  if (!parsed) {
    throw new Error(`${name} must be one of: file, keychain`);
  }

  return parsed;
}

async function resolveBackend(): Promise<SecretBackend> {
  const envBackend = parseRequiredBackend(KEYRING_BACKEND_ENV, process.env[KEYRING_BACKEND_ENV]);
  if (envBackend) {
    return envBackend;
  }

  const cfg = await loadConfig();
  const cfgBackend = parseRequiredBackend("keyring_backend", cfg.keyring_backend);
  if (cfgBackend) {
    return cfgBackend;
  }

  return process.platform === "darwin" ? "keychain" : "file";
}

export async function getSecretBackend(): Promise<SecretBackend> {
  return resolveBackend();
}

async function keyringFilePath(): Promise<string> {
  const dir = await ensureKeyringDir();
  return path.join(dir, "secrets.json");
}

async function readFileStore(filePath: string): Promise<SecretFile> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as SecretFile;
    if (parsed?.version !== 1 || typeof parsed.entries !== "object") {
      throw new Error("invalid keyring file format");
    }
    return parsed;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { version: 1, entries: {} };
    }
    throw err;
  }
}

async function writeFileStore(filePath: string, store: SecretFile): Promise<void> {
  const content = JSON.stringify(store, null, 2);
  await fs.writeFile(filePath, content, { mode: 0o600 });
}

async function readPassphrase(): Promise<string> {
  if (cachedPassphrase) {
    return cachedPassphrase;
  }

  const fromEnv = process.env[KEYRING_PASSWORD_ENV];
  if (fromEnv && fromEnv.trim()) {
    cachedPassphrase = fromEnv;
    return cachedPassphrase;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`no TTY available for keyring password prompt; set ${KEYRING_PASSWORD_ENV}`);
  }

  const passphrase = (await promptHidden("Keyring password: ")).trim();

  if (!passphrase) {
    throw new Error("keyring password is required");
  }

  cachedPassphrase = passphrase;
  return passphrase;
}

export async function promptHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const wasRaw = Boolean((stdin as NodeJS.ReadStream).isRaw);

    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
    };

    const finish = () => {
      cleanup();
      stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk: Buffer | string) => {
      const str = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      for (const ch of str) {
        if (ch === "\r" || ch === "\n") {
          finish();
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }
        value += ch;
      }
    };

    stdout.write(prompt);
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

function encrypt(value: Buffer, passphrase: string): SecretEntry {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64")
  };
}

function decrypt(entry: SecretEntry, passphrase: string): Buffer {
  const salt = Buffer.from(entry.salt, "base64");
  const iv = Buffer.from(entry.iv, "base64");
  const data = Buffer.from(entry.ciphertext, "base64");
  const tag = Buffer.from(entry.tag, "base64");

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

async function setSecretFile(key: string, value: Buffer): Promise<void> {
  const passphrase = await readPassphrase();
  const filePath = await keyringFilePath();
  const store = await readFileStore(filePath);
  store.entries[key] = encrypt(value, passphrase);
  await writeFileStore(filePath, store);
}

async function getSecretFile(key: string): Promise<Buffer> {
  const filePath = await keyringFilePath();
  const store = await readFileStore(filePath);
  const entry = store.entries[key];
  if (!entry) {
    throw new SecretNotFoundError();
  }

  const passphrase = await readPassphrase();
  try {
    return decrypt(entry, passphrase);
  } catch {
    throw new Error("failed to decrypt secret; check MAILCLI_KEYRING_PASSWORD");
  }
}

function trimTrailingLineEnding(value: string): string {
  if (value.endsWith("\r\n")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("\n")) {
    return value.slice(0, -1);
  }
  return value;
}

async function runSecurity(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("security", args, { stdio: ["ignore", "pipe", "pipe"] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("exit", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(out);
        return;
      }
      reject(new SecurityCommandError(`security command failed: ${err || `exit code ${code ?? "unknown"}`}`.trim(), code, err));
    });
  });
}

function ensureKeychainSupported(): void {
  if (process.platform !== "darwin") {
    throw new Error("keychain backend is only supported on macOS");
  }
}

function isKeychainItemNotFound(err: unknown): boolean {
  return err instanceof SecurityCommandError && /could not be found|item not found/i.test(err.stderr);
}

async function setSecretKeychain(key: string, value: Buffer): Promise<void> {
  ensureKeychainSupported();
  await runSecurity([
    "add-generic-password",
    "-a",
    key,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    value.toString("utf8"),
    "-U"
  ]);
}

async function getSecretKeychain(key: string): Promise<Buffer> {
  ensureKeychainSupported();

  try {
    const out = await runSecurity([
      "find-generic-password",
      "-a",
      key,
      "-s",
      KEYCHAIN_SERVICE,
      "-w"
    ]);
    return Buffer.from(trimTrailingLineEnding(out), "utf8");
  } catch (err) {
    if (isKeychainItemNotFound(err)) {
      throw new SecretNotFoundError();
    }
    throw err;
  }
}

async function deleteSecretKeychain(key: string): Promise<void> {
  ensureKeychainSupported();
  try {
    await runSecurity([
      "delete-generic-password",
      "-a",
      key,
      "-s",
      KEYCHAIN_SERVICE
    ]);
  } catch (err) {
    if (isKeychainItemNotFound(err)) {
      return;
    }
    throw err;
  }
}

export async function initializeKeychainAccess(): Promise<void> {
  const backend = await resolveBackend();
  if (backend !== "keychain") {
    throw new Error("keychain backend is not enabled; set keyring_backend to 'keychain'");
  }

  ensureKeychainSupported();
  const testKey = `mailcli:keychain-init:${process.pid}:${Date.now()}`;
  const testValue = `mailcli-init-${crypto.randomUUID()}`;

  await setSecretKeychain(testKey, Buffer.from(testValue, "utf8"));
  try {
    const loaded = await getSecretKeychain(testKey);
    if (loaded.toString("utf8") !== testValue) {
      throw new Error("keychain verification failed");
    }
  } finally {
    await deleteSecretKeychain(testKey);
  }
}

export async function setSecret(key: string, value: Buffer): Promise<void> {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error("missing secret key");
  }

  const backend = await resolveBackend();
  if (backend === "keychain") {
    await setSecretKeychain(normalized, value);
    return;
  }

  await setSecretFile(normalized, value);
}

export async function getSecret(key: string): Promise<Buffer> {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error("missing secret key");
  }

  const backend = await resolveBackend();
  if (backend === "keychain") {
    return getSecretKeychain(normalized);
  }

  return getSecretFile(normalized);
}

export async function setPassword(username: string, password: string): Promise<void> {
  const user = normalize(username);
  if (!user) {
    throw new Error("missing username");
  }
  if (!password) {
    throw new Error("missing password");
  }
  await setSecret(passwordKey(user), Buffer.from(password, "utf8"));
}

export async function getPassword(username: string): Promise<string> {
  const user = normalize(username);
  if (!user) {
    throw new Error("missing username");
  }
  const secret = await getSecret(passwordKey(user));
  return secret.toString("utf8");
}
