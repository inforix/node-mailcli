import { Command } from "commander";
import { validateIMAP } from "../config/config.js";
import { Service } from "../imap/service.js";
import { getConfig } from "./helpers.js";
import { parseUID } from "./util.js";

function formatDateWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const tzHour = pad(Math.floor(abs / 60));
  const tzMinute = pad(abs % 60);

  return `${year}-${month}-${day} ${hour}:${minute}:${second} ${sign}${tzHour}${tzMinute}`;
}

export function newReadCmd(): Command {
  const cmd = new Command("read")
    .description("Read a message by UID")
    .argument("<uid>")
    .option("--mailbox <mailbox>", "Mailbox name", "INBOX")
    .option("--html", "Show raw HTML body when available", false);

  cmd.action(async (uidArg: string) => {
    const uid = parseUID(uidArg);
    const opts = cmd.opts<{ mailbox: string; html: boolean }>();

    const cfg = await getConfig();
    validateIMAP(cfg);

    const service = new Service();
    const detail = await service.readMessage(cfg, opts.mailbox, uid);

    console.log(`UID: ${detail.uid}`);
    if (detail.subject) {
      console.log(`Subject: ${detail.subject}`);
    }
    if (detail.from) {
      console.log(`From: ${detail.from}`);
    }
    if (detail.to) {
      console.log(`To: ${detail.to}`);
    }
    if (detail.cc) {
      console.log(`Cc: ${detail.cc}`);
    }
    if (detail.date) {
      const date = new Date(detail.date);
      console.log(`Date: ${formatDateWithOffset(date)}`);
    }
    if (detail.attachments.length > 0) {
      console.log(`Attachments: ${detail.attachments.join(", ")}`);
    }

    console.log("");
    const body = opts.html && detail.htmlBody ? detail.htmlBody : detail.textBody;
    console.log(body ?? "");
  });

  return cmd;
}
