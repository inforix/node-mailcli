import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";
import { parseUID } from "./util.js";

export function newAttachmentsCmd(): Command {
  const cmd = new Command("attachments").description("Attachment operations");

  const download = new Command("download")
    .description("Download attachments from a message")
    .argument("<uid>")
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX")
    .option("--output <dir>", "Output directory", ".");

  download.action(async (uidArg: string) => {
    const uid = parseUID(uidArg);
    const opts = download.opts<{ mailbox: string; output: string }>();

    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    const files = await service.downloadAttachments(cfg, opts.mailbox, uid, opts.output || ".");

    if (files.length === 0) {
      console.log("No attachments found.");
      return;
    }

    for (const file of files) {
      console.log(file);
    }
  });

  cmd.addCommand(download);
  return cmd;
}
