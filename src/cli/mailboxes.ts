import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";

export function newMailboxesCmd(): Command {
  const cmd = new Command("mailboxes").description("Mailbox operations");

  const list = new Command("list").description("List mailboxes");
  list.action(async () => {
    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    const mailboxes = await service.listMailboxes(cfg);
    for (const name of mailboxes) {
      console.log(name);
    }
  });

  const create = new Command("create").description("Create a mailbox").argument("<name>");
  create.action(async (name: string) => {
    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    await service.createMailbox(cfg, name);
    console.log("Mailbox created.");
  });

  cmd.addCommand(list);
  cmd.addCommand(create);
  return cmd;
}
