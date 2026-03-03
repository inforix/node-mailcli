import { Command } from "commander";
import { loadRuntimeConfig } from "./config-loader.js";

export function commandAction(
  fn: (cmd: Command, ...args: unknown[]) => Promise<void>
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    await fn(cmd, ...args.slice(0, -1));
  };
}

export async function getConfig() {
  return loadRuntimeConfig();
}
