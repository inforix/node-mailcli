import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { ensureKeyringDir } from "../config/paths.js";

const KEYRING_PASSWORD_ENV = "MAILCLI_KEYRING_PASSWORD";

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

let cachedPassphrase: string | undefined;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function passwordKey(username: string): string {
  return `auth:password:${normalize(username)}`;
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

async function promptHidden(prompt: string): Promise<string> {
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

export async function setSecret(key: string, value: Buffer): Promise<void> {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error("missing secret key");
  }

  const passphrase = await readPassphrase();
  const filePath = await keyringFilePath();
  const store = await readFileStore(filePath);
  store.entries[normalized] = encrypt(value, passphrase);
  await writeFileStore(filePath, store);
}

export async function getSecret(key: string): Promise<Buffer> {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error("missing secret key");
  }

  const filePath = await keyringFilePath();
  const store = await readFileStore(filePath);
  const entry = store.entries[normalized];
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
