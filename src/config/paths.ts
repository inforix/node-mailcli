import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export const APP_NAME = "mailcli";

export function configDir(): string {
  return path.join(os.homedir(), ".config", APP_NAME);
}

export async function ensureConfigDir(): Promise<string> {
  const dir = configDir();
  await fs.mkdir(dir, { mode: 0o700, recursive: true });
  return dir;
}

export function configPath(): string {
  return path.join(configDir(), "config.yaml");
}

export function keyringDir(): string {
  return path.join(configDir(), "keyring");
}

export async function ensureKeyringDir(): Promise<string> {
  const dir = keyringDir();
  await fs.mkdir(dir, { mode: 0o700, recursive: true });
  return dir;
}
