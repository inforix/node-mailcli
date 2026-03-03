import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";

export interface ReplyInfo {
  messageID: string;
  references: string;
  from: string;
  replyTo: string;
  to: string[];
  cc: string[];
  date: string;
  subject: string;
  body: string;
  bodyHTML: string;
}

function parseEmailAddressesFallback(headerValue: string): string[] {
  const parts = headerValue.split(",");
  const out: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) {
      continue;
    }
    const lt = p.lastIndexOf("<");
    const gt = p.lastIndexOf(">");
    if (lt !== -1 && gt > lt) {
      const mail = p.slice(lt + 1, gt).trim();
      if (mail) {
        out.push(mail.toLowerCase());
      }
      continue;
    }
    if (p.includes("@")) {
      out.push(p.toLowerCase());
    }
  }
  return out;
}

function parseEmailAddresses(headerValue: string): string[] {
  if (!headerValue.trim()) {
    return [];
  }

  const m = headerValue.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  if (!m || m.length === 0) {
    return parseEmailAddressesFallback(headerValue);
  }
  return m.map((x) => x.toLowerCase());
}

function flattenAddressObject(value: AddressObject | AddressObject[] | undefined): AddressObject[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function dedupe(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(address);
  }
  return out;
}

function filterSelf(addresses: string[], selfEmail: string): string[] {
  const self = selfEmail.toLowerCase();
  return addresses.filter((a) => a.toLowerCase() !== self);
}

function looksLikeHTML(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body") ||
    trimmed.startsWith("<meta") ||
    trimmed.includes("<html")
  );
}

function escapeHTML(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeTextToHTML(value: string): string {
  return escapeHTML(value).replaceAll("\n", "<br>\n");
}

function formatQuotedMessage(from: string, date: string, body: string): string {
  if (!body) {
    return "";
  }
  let intro = "Original message:";
  if (date && from) {
    intro = `On ${date}, ${from} wrote:`;
  } else if (from) {
    intro = `${from} wrote:`;
  }

  const quoted = body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return `\n\n${intro}\n${quoted}\n`;
}

function formatQuotedMessageHTMLWithContent(from: string, date: string, htmlContent: string): string {
  const sender = from || "Original sender";
  const dateText = date || "an earlier date";
  return `<br><br><div class="gmail_quote"><div class="gmail_attr">On ${escapeHTML(dateText)}, ${escapeHTML(sender)} wrote:</div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${htmlContent}</blockquote></div>`;
}

export async function extractReplyInfo(raw: Buffer, includeBodies: boolean): Promise<ReplyInfo> {
  const parsed = await simpleParser(raw);
  const to = flattenAddressObject(parsed.to)
    .flatMap((group) => group.value ?? [])
    .map((entry) => entry.address?.toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
  const cc = flattenAddressObject(parsed.cc)
    .flatMap((group) => group.value ?? [])
    .map((entry) => entry.address?.toLowerCase())
    .filter((entry): entry is string => Boolean(entry));

  const info: ReplyInfo = {
    messageID: String(parsed.headers.get("message-id") ?? "").trim(),
    references: String(parsed.headers.get("references") ?? "").trim(),
    from: parsed.from?.text ?? "",
    replyTo: parsed.replyTo?.text ?? "",
    to,
    cc,
    date: String(parsed.headers.get("date") ?? "").trim(),
    subject: parsed.subject ?? "",
    body: "",
    bodyHTML: ""
  };

  if (!includeBodies) {
    return info;
  }

  info.body = parsed.text ?? "";
  info.bodyHTML = typeof parsed.html === "string" ? parsed.html : "";

  if (info.body && looksLikeHTML(info.body)) {
    info.body = "";
  }

  return info;
}

export function buildReplyHeaders(info: ReplyInfo | null): { inReplyTo: string; references: string } {
  if (!info) {
    return { inReplyTo: "", references: "" };
  }

  const messageID = info.messageID.trim();
  let refs = info.references.trim();
  if (!refs) {
    refs = messageID;
  } else if (messageID && !refs.includes(messageID)) {
    refs = `${refs} ${messageID}`;
  }

  return { inReplyTo: messageID, references: refs };
}

export function buildReplyRecipients(info: ReplyInfo | null, selfEmail: string): string[] {
  if (!info) {
    return [];
  }
  const replyTarget = info.replyTo.trim() || info.from;
  const to = parseEmailAddresses(replyTarget);
  return dedupe(filterSelf(to, selfEmail));
}

export function buildReplyAllRecipients(info: ReplyInfo | null, selfEmail: string): { to: string[]; cc: string[] } {
  if (!info) {
    return { to: [], cc: [] };
  }

  const replyTarget = info.replyTo.trim() || info.from;
  const to = dedupe(filterSelf([...parseEmailAddresses(replyTarget), ...info.to], selfEmail));
  const cc = dedupe(filterSelf(info.cc, selfEmail)).filter((address) => !to.some((t) => t.toLowerCase() === address.toLowerCase()));

  return { to, cc };
}

export function replySubject(original: string): string {
  const trimmed = original.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase().startsWith("re:")) {
    return trimmed;
  }
  return `Re: ${trimmed}`;
}

export function applyQuoteToBodies(plainBody: string, htmlBody: string, quote: boolean, info: ReplyInfo | null): { plain: string; html: string } {
  if (!quote || !info) {
    return { plain: plainBody, html: htmlBody };
  }

  if (!info.body && !info.bodyHTML) {
    return { plain: plainBody, html: htmlBody };
  }

  let outPlain = plainBody;
  if (info.body) {
    outPlain += formatQuotedMessage(info.from, info.date, info.body);
  }

  const quoteHTML = info.bodyHTML || (info.body ? escapeTextToHTML(info.body) : "");
  if (!quoteHTML) {
    return { plain: outPlain, html: htmlBody };
  }

  let outHTML = htmlBody;
  const quotedBlock = formatQuotedMessageHTMLWithContent(info.from, info.date, quoteHTML);
  if (!outHTML.trim()) {
    outHTML = `${escapeTextToHTML(plainBody.trim())}${quotedBlock}`;
  } else {
    outHTML += quotedBlock;
  }

  return { plain: outPlain, html: outHTML };
}

const scriptPattern = /<script[^>]*>[\s\S]*?<\/script>/gi;
const stylePattern = /<style[^>]*>[\s\S]*?<\/style>/gi;
const htmlTagPattern = /<[^>]*>/g;
const whitespacePattern = /\s+/g;

export function stripHTMLTags(value: string): string {
  return value
    .replace(scriptPattern, "")
    .replace(stylePattern, "")
    .replace(htmlTagPattern, " ")
    .replace(whitespacePattern, " ")
    .trim();
}
