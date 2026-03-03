import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { ERR_THREAD_UNSUPPORTED } from "../imap/types.js";
import { printMessages, printThreads } from "./format.js";
import { getConfig } from "./helpers.js";

type SearchOptions = {
  mailbox: string;
  page: number;
  pageSize: number;
  threads: boolean;
};

export function newSearchCmd(): Command {
  const cmd = new Command("search")
    .description("Search messages")
    .argument("<query>")
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX")
    .option("--page <page>", "Page number (1-based, newest first)", (value) => Number.parseInt(value, 10), 1)
    .option("--page-size <pageSize>", "Messages per page", (value) => Number.parseInt(value, 10), 20)
    .option("--threads", "Show thread summaries when supported", false);

  cmd.action(async (query: string) => {
    const options = cmd.opts<SearchOptions>();
    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    if (options.threads) {
      try {
        const { threads, total } = await service.searchThreads(cfg, options.mailbox, query, options.page, options.pageSize);
        console.log(`Mailbox: ${options.mailbox} (threads ${total})`);
        printThreads(threads);
        return;
      } catch (err) {
        if (err !== ERR_THREAD_UNSUPPORTED) {
          throw err;
        }
        console.error("Server does not support THREAD; showing messages instead.");
      }
    }

    const { messages, total } = await service.searchMessages(cfg, options.mailbox, query, options.page, options.pageSize);
    console.log(`Mailbox: ${options.mailbox} (total ${total})`);
    printMessages(messages);
  });

  return cmd;
}
