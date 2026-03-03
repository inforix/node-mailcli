import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, loadConfig, saveConfig } from "../src/config/config.js";
import { configPath } from "../src/config/paths.js";

describe("config", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MAILCLI_IMAP_HOST;
    delete process.env.MAILCLI_SMTP_HOST;
    delete process.env.MAILCLI_AUTH_USERNAME;
    delete process.env.MAILCLI_AUTH_PASSWORD;
  });

  it("loads env override on top of file", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "mailcli-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(home);

    const cfg = defaultConfig();
    cfg.imap.host = "imap.example.com";
    cfg.smtp.host = "smtp.example.com";
    cfg.auth.username = "user@example.com";
    cfg.auth.password = "secret";

    await saveConfig(cfg);

    process.env.MAILCLI_IMAP_HOST = "env.imap.local";

    const loaded = await loadConfig();
    expect(loaded.imap.host).toBe("env.imap.local");
    expect(loaded.smtp.host).toBe("smtp.example.com");
  });

  it("creates config file under expected path", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "mailcli-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(home);

    const cfg = defaultConfig();
    cfg.imap.host = "imap.example.com";
    cfg.smtp.host = "smtp.example.com";
    cfg.auth.username = "user@example.com";
    cfg.auth.password = "secret";

    const savedPath = await saveConfig(cfg);
    expect(savedPath).toBe(configPath());

    const content = await fs.readFile(savedPath, "utf8");
    expect(content).toContain("imap:");
  });
});
