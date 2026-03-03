#!/usr/bin/env node

import { execute } from "./cli/root.js";

async function main(): Promise<void> {
  try {
    await execute(process.argv);
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
    } else {
      console.error(String(err));
    }
    process.exitCode = 1;
  }
}

await main();
