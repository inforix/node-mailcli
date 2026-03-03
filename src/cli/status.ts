import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";

export function newStatusCmd(): Command {
  const cmd = new Command("status").description("Show mailbox status");

  cmd.action(async () => {
    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    const status = await service.status(cfg, "INBOX");
    console.log(`INBOX: ${status.messages} messages, ${status.unseen} unseen`);
  });

  return cmd;
}
