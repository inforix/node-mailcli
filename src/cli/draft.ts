import { Command } from "commander";
import { validateIMAP, validateSMTP } from "../config/config.js";
import { buildMessage, extractRecipients } from "../email/email.js";
import {
  applyQuoteToBodies,
  buildReplyAllRecipients,
  buildReplyHeaders,
  buildReplyRecipients,
  extractReplyInfo,
  replySubject
} from "../email/reply.js";
import { Service } from "../imap/service.js";
import { printMessages } from "./format.js";
import { getConfig } from "./helpers.js";
import { sendSMTP } from "../smtp/smtp.js";
import { loadBody, parseUID, splitList } from "./util.js";

type DraftBaseOptions = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  bodyFile: string;
  bodyHtml: string;
  replyTo: string;
  replyUid: string;
  replyAll: boolean;
  quote: boolean;
  replyMailbox: string;
  attachment: string[];
};

export function newDraftCmd(): Command {
  const cmd = new Command("draft").description("Draft operations");

  const save = new Command("save")
    .description("Save a draft to the Drafts mailbox")
    .option("--to <list>", "Comma-separated recipients", "")
    .option("--cc <list>", "Comma-separated CC recipients", "")
    .option("--bcc <list>", "Comma-separated BCC recipients", "")
    .option("--subject <subject>", "Message subject", "")
    .option("--body <body>", "Message body (plain text)", "")
    .option("--body-file <path>", "Path to file containing message body ('-' for stdin)", "")
    .option("--body-html <html>", "Message body (HTML)", "")
    .option("--reply-to <address>", "Reply-To header address", "")
    .option("--reply-uid <uid>", "Reply to message UID (uses headers and thread)", "")
    .option("--reply-all", "Reply-all using original recipients (requires --reply-uid)", false)
    .option("--quote", "Include quoted original message (requires --reply-uid)", false)
    .option("--reply-mailbox <mailbox>", "Mailbox containing the reply target", "INBOX")
    .option("--attachment <path>", "Attachment file paths (repeatable)", (value, prev: string[]) => {
      prev.push(value);
      return prev;
    }, []);

  save.action(async () => {
    const opts = save.opts<DraftBaseOptions>();
    const cfg = await getConfig();
    validateIMAP(cfg);

    let content = await loadBody(opts.body, opts.bodyFile);
    let htmlBody = opts.bodyHtml;

    if (opts.replyAll && !opts.replyUid.trim()) {
      throw new Error("--reply-all requires --reply-uid");
    }
    if (opts.quote && !opts.replyUid.trim()) {
      throw new Error("--quote requires --reply-uid");
    }

    const service = new Service();

    let toList: string[] = splitList(opts.to);
    let ccList: string[] = splitList(opts.cc);
    let subject = opts.subject;
    let inReplyTo = "";
    let references = "";

    if (opts.replyUid.trim()) {
      const replyUID = parseUID(opts.replyUid);
      const raw = await service.fetchRawMessage(cfg, opts.replyMailbox || "INBOX", replyUID);
      const replyInfo = await extractReplyInfo(raw, opts.quote);

      const headers = buildReplyHeaders(replyInfo);
      inReplyTo = headers.inReplyTo;
      references = headers.references;

      const quoted = applyQuoteToBodies(content, htmlBody, opts.quote, replyInfo);
      content = quoted.plain;
      htmlBody = quoted.html;

      if (!subject.trim() && replyInfo.subject) {
        subject = replySubject(replyInfo.subject);
      }

      if (opts.replyAll) {
        const recipients = buildReplyAllRecipients(replyInfo, cfg.auth.username);
        toList = opts.to.trim() ? splitList(opts.to) : recipients.to;
        ccList = opts.cc.trim() ? splitList(opts.cc) : recipients.cc;
      } else {
        toList = opts.to.trim() ? splitList(opts.to) : buildReplyRecipients(replyInfo, cfg.auth.username);
      }
    }

    const bccList = splitList(opts.bcc);

    const message = await buildMessage({
      from: cfg.auth.username,
      to: toList,
      cc: ccList,
      bcc: bccList,
      replyTo: opts.replyTo,
      subject,
      body: content,
      bodyHTML: htmlBody,
      inReplyTo,
      references,
      attachments: opts.attachment,
      storeBccHeader: bccList.length > 0
    });

    const draftsMailbox = cfg.defaults.drafts_mailbox || "Drafts";
    await service.saveDraft(cfg, draftsMailbox, message);
    console.log(`Draft saved to ${draftsMailbox}.`);
  });

  const list = new Command("list")
    .description("List drafts")
    .option("--page <page>", "Page number (1-based, newest first)", (value) => Number.parseInt(value, 10), 1)
    .option("--page-size <pageSize>", "Messages per page", (value) => Number.parseInt(value, 10), 20);

  list.action(async () => {
    const opts = list.opts<{ page: number; pageSize: number }>();
    const cfg = await getConfig();
    validateIMAP(cfg);

    const draftsMailbox = cfg.defaults.drafts_mailbox || "Drafts";
    const service = new Service();
    const { messages, total } = await service.listMessages(cfg, draftsMailbox, opts.page, opts.pageSize);

    console.log(`Drafts: ${draftsMailbox} (total ${total})`);
    printMessages(messages);
  });

  const send = new Command("send")
    .description("Send a draft by UID")
    .argument("<uid>")
    .option("--keep", "Keep draft after sending", false);

  send.action(async (uidArg: string) => {
    const uid = parseUID(uidArg);
    const opts = send.opts<{ keep: boolean }>();

    const cfg = await getConfig();
    validateIMAP(cfg);
    validateSMTP(cfg);

    const service = new Service();
    const draftsMailbox = cfg.defaults.drafts_mailbox || "Drafts";

    const raw = await service.fetchRawMessage(cfg, draftsMailbox, uid);
    const recipients = await extractRecipients(raw);

    if (recipients.length === 0) {
      throw new Error("draft has no recipients");
    }

    await sendSMTP(cfg, cfg.auth.username, recipients, raw);

    if (!opts.keep) {
      await service.deleteMessage(cfg, draftsMailbox, uid);
    }

    console.log("Draft sent.");
  });

  cmd.addCommand(save);
  cmd.addCommand(list);
  cmd.addCommand(send);
  return cmd;
}
