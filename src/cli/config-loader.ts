import { loadConfig } from "../config/config.js";
import { getPassword, SecretNotFoundError } from "../secrets/store.js";
import { Config } from "../types/config.js";

export async function loadRuntimeConfig(): Promise<Config> {
  const cfg = await loadConfig();

  if (process.env.MAILCLI_AUTH_PASSWORD !== undefined) {
    cfg.auth.passwordSource = "env";
    return cfg;
  }

  if (cfg.auth.password) {
    cfg.auth.passwordSource = "config";
    return cfg;
  }

  if (!cfg.auth.username) {
    return cfg;
  }

  try {
    cfg.auth.password = await getPassword(cfg.auth.username);
    cfg.auth.passwordSource = "secrets";
  } catch (err) {
    if (!(err instanceof SecretNotFoundError)) {
      throw err;
    }
  }

  return cfg;
}
