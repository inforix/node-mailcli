import { Command } from "commander";
import process from "node:process";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { configPath } from "../config/paths.js";
import { redactConfig } from "../config/config.js";
import { getConfig } from "./helpers.js";

export function newConfigCmd(): Command {
  const cmd = new Command("config").description("Config management");

  const show = new Command("show")
    .description("Show effective configuration")
    .option("--show-password", "Show password in output", false);

  show.action(async () => {
    const opts = show.opts<{ showPassword: boolean }>();
    let cfg = await getConfig();
    if (!opts.showPassword) {
      cfg = redactConfig(cfg);
    }
    const out = YAML.stringify(cfg);
    console.log(out);
  });

  const edit = new Command("edit").description("Open config file in $EDITOR");
  edit.action(async () => {
    const editor = process.env.EDITOR;
    const path = configPath();

    if (!editor) {
      throw new Error(`EDITOR not set; config file is ${path}`);
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [path], { stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`editor exited with code ${code ?? "unknown"}`));
        }
      });
    });
  });

  cmd.addCommand(show);
  cmd.addCommand(edit);
  return cmd;
}
