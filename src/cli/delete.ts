import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";
import { parseUID } from "./util.js";

export function newDeleteCmd(): Command {
  const cmd = new Command("delete")
    .description("Delete a message by UID")
    .argument("<uid>")
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX");

  cmd.action(async (uidArg: string) => {
    const uid = parseUID(uidArg);
    const opts = cmd.opts<{ mailbox: string }>();

    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    await service.deleteMessage(cfg, opts.mailbox, uid);
    console.log("Deleted.");
  });

  return cmd;
}
