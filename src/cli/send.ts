import { Command } from "commander";
import { validateIMAP, validateSMTP } from "../config/config.js";
import { buildMessage } from "../email/email.js";
import {
  applyQuoteToBodies,
  buildReplyAllRecipients,
  buildReplyHeaders,
  buildReplyRecipients,
  extractReplyInfo,
  replySubject
} from "../email/reply.js";
import { Service } from "../imap/service.js";
import { sendSMTP } from "../smtp/smtp.js";
import { getConfig } from "./helpers.js";
import { loadBody, parseUID, splitList } from "./util.js";

type SendOptions = {
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

export function newSendCmd(): Command {
  const cmd = new Command("send")
    .description("Send an email")
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

  cmd.action(async () => {
    const opts = cmd.opts<SendOptions>();
    const cfg = await getConfig();

    validateSMTP(cfg);

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
      validateIMAP(cfg);

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

    if (!content.trim() && !htmlBody.trim()) {
      throw new Error("message body required (use --body, --body-file, --body-html, or --quote)");
    }

    const recipients = [...toList, ...ccList, ...bccList];
    if (recipients.length === 0) {
      throw new Error("at least one recipient is required");
    }

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
      attachments: opts.attachment
    });

    await sendSMTP(cfg, cfg.auth.username, recipients, message);
    console.log("Sent.");
  });

  return cmd;
}
