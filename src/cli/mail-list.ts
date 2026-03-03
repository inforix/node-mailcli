import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { ERR_THREAD_UNSUPPORTED } from "../imap/types.js";
import { Service } from "../imap/service.js";
import { printMessages, printThreads } from "./format.js";
import { getConfig } from "./helpers.js";

type ListOptions = {
  mailbox: string;
  page: number;
  pageSize: number;
  threads: boolean;
};

async function runMailList(opts: ListOptions): Promise<void> {
  const cfg = await getConfig();
  validateIMAP(cfg);

  const mailbox = opts.mailbox || "INBOX";
  const service = new Service();

  if (opts.threads) {
    try {
      const { threads, total } = await service.listThreads(cfg, mailbox, opts.page, opts.pageSize);
      console.log(`Mailbox: ${mailbox} (threads ${total})`);
      printThreads(threads);
      return;
    } catch (err) {
      if (err !== ERR_THREAD_UNSUPPORTED) {
        throw err;
      }
      console.error("Server does not support THREAD; showing messages instead.");
    }
  }

  const { messages, total } = await service.listMessages(cfg, mailbox, opts.page, opts.pageSize);
  console.log(`Mailbox: ${mailbox} (total ${total})`);
  printMessages(messages);
}

export function newMailListCmd(): Command {
  const cmd = new Command("list").description("List messages");

  cmd
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX")
    .option("--page <page>", "Page number (1-based, newest first)", (value) => Number.parseInt(value, 10), 1)
    .option("--page-size <pageSize>", "Messages per page", (value) => Number.parseInt(value, 10), 20)
    .option("--threads", "Show thread summaries when supported", false)
    .action(async () => {
      const options = cmd.opts<ListOptions>();
      await runMailList(options);
    });

  return cmd;
}

export function newMailCmd(): Command {
  const cmd = new Command("mail").description("Mail operations");
  cmd.addCommand(newMailListCmd());
  return cmd;
}

export function newInboxCmd(): Command {
  const cmd = new Command("inbox").description("Inbox operations");
  const list = new Command("list").description("List messages in INBOX");

  list
    .option("--page <page>", "Page number (1-based, newest first)", (value) => Number.parseInt(value, 10), 1)
    .option("--page-size <pageSize>", "Messages per page", (value) => Number.parseInt(value, 10), 20)
    .option("--threads", "Show thread summaries when supported", false)
    .action(async () => {
      const options = list.opts<{ page: number; pageSize: number; threads: boolean }>();
      await runMailList({ mailbox: "INBOX", page: options.page, pageSize: options.pageSize, threads: options.threads });
    });

  cmd.addCommand(list);
  return cmd;
}
