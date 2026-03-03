import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";
import { parseUID } from "./util.js";

export function newMoveCmd(): Command {
  const cmd = new Command("move")
    .description("Move a message to another mailbox")
    .argument("<uid>")
    .argument("<mailbox>")
    .option("--mailbox <mailbox>", "Source mailbox", "INBOX");

  cmd.action(async (uidArg: string, destination: string) => {
    const uid = parseUID(uidArg);
    const opts = cmd.opts<{ mailbox: string }>();

    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    await service.moveMessage(cfg, opts.mailbox, uid, destination);
    console.log("Moved.");
  });

  return cmd;
}
