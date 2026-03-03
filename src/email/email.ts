import fs from "node:fs/promises";
import path from "node:path";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { AddressObject } from "mailparser";
import { simpleParser } from "mailparser";

export interface ComposeInput {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string;
  subject: string;
  body: string;
  bodyHTML: string;
  inReplyTo: string;
  references: string;
  attachments: string[];
  storeBccHeader?: boolean;
}

function normalizeAddressList(list: string[]): string[] {
  return list.map((x) => x.trim()).filter(Boolean);
}

function flattenAddressObject(value: AddressObject | AddressObject[] | undefined): AddressObject[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function buildMessage(input: ComposeInput): Promise<Buffer> {
  if (!input.from.trim()) {
    throw new Error("from address is required");
  }

  const to = normalizeAddressList(input.to);
  const cc = normalizeAddressList(input.cc);
  const bcc = normalizeAddressList(input.bcc);

  const attachments = [] as Array<{ filename: string; path: string }>;
  for (const filePath of input.attachments) {
    const p = filePath.trim();
    if (!p) {
      continue;
    }
    await fs.access(p);
    attachments.push({ filename: path.basename(p), path: p });
  }

  const headers: Record<string, string> = {};
  if (input.storeBccHeader && bcc.length > 0) {
    headers["X-Mailcli-Bcc"] = bcc.join(", ");
  }

  const composer = new MailComposer({
    from: input.from,
    to: to.length > 0 ? to.join(", ") : undefined,
    cc: cc.length > 0 ? cc.join(", ") : undefined,
    bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject || undefined,
    text: input.body || undefined,
    html: input.bodyHTML || undefined,
    inReplyTo: input.inReplyTo || undefined,
    references: input.references || undefined,
    headers,
    attachments
  });

  const message = await composer.compile().build();
  return Buffer.isBuffer(message) ? message : Buffer.from(message);
}

export async function extractRecipients(raw: Buffer): Promise<string[]> {
  const parsed = await simpleParser(raw);
  const recipients: string[] = [];

  const read = (value: AddressObject | AddressObject[] | undefined) => {
    for (const addressObject of flattenAddressObject(value)) {
      for (const item of addressObject.value ?? []) {
        if (item.address) {
          recipients.push(item.address);
        }
      }
    }
  };

  read(parsed.to);
  read(parsed.cc);
  read(parsed.bcc);

  const xBcc = String(parsed.headers.get("x-mailcli-bcc") ?? "");
  if (xBcc.trim()) {
    for (const part of xBcc.split(",")) {
      const addr = part.trim();
      if (addr) {
        recipients.push(addr);
      }
    }
  }

  return recipients;
}
