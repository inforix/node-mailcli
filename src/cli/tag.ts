import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";
import { parseUID } from "./util.js";

export function newTagCmd(): Command {
  const cmd = new Command("tag")
    .description("Add a tag/label (keyword) to a message")
    .argument("<uid>")
    .argument("<tag>")
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX");

  cmd.action(async (uidArg: string, tag: string) => {
    const uid = parseUID(uidArg);
    const opts = cmd.opts<{ mailbox: string }>();

    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    await service.addTag(cfg, opts.mailbox, uid, tag);
    console.log("Tagged.");
  });

  return cmd;
}
