import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { ImapFlow, FetchMessageObject, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { Config } from "../types/config.js";
import { streamToBuffer } from "../utils/stream.js";
import { stripHTMLTags } from "../email/reply.js";
import { ERR_THREAD_UNSUPPORTED, MessageDetail, MessageSummary, ThreadSummary } from "./types.js";

const require = createRequire(import.meta.url);
const { searchCompiler } = require("imapflow/lib/search-compiler.js") as {
  searchCompiler: (connection: unknown, query: SearchObject) => unknown[];
};

function formatAddresses(addresses?: Array<{ name?: string; address?: string }>): string {
  if (!addresses || addresses.length === 0) {
    return "";
  }
  return addresses
    .map((entry) => {
      if (!entry.address) {
        return "";
      }
      if (entry.name) {
        return `${entry.name} <${entry.address}>`;
      }
      return entry.address;
    })
    .filter(Boolean)
    .join(", ");
}

function normalizePage(page: number, pageSize: number): { page: number; pageSize: number } {
  return {
    page: page > 0 ? page : 1,
    pageSize: pageSize > 0 ? pageSize : 20
  };
}

function ensureUniqueFilename(filepath: string): Promise<string> {
  return fs
    .stat(filepath)
    .then(async () => {
      const ext = path.extname(filepath);
      const base = filepath.slice(0, filepath.length - ext.length);
      for (let i = 1; i < 1000; i += 1) {
        const candidate = `${base}-${i}${ext}`;
        try {
          await fs.stat(candidate);
        } catch (err) {
          const e = err as NodeJS.ErrnoException;
          if (e.code === "ENOENT") {
            return candidate;
          }
          throw err;
        }
      }
      return filepath;
    })
    .catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        return filepath;
      }
      throw err;
    });
}

function selectThreadAlgorithm(capabilities: Map<string, unknown>): string | null {
  const algorithms = [...capabilities.keys()]
    .map((cap) => cap.toUpperCase())
    .filter((cap) => cap.startsWith("THREAD="))
    .map((cap) => cap.slice("THREAD=".length));

  if (algorithms.length === 0) {
    return null;
  }

  const preferred = ["REFERENCES", "REFS", "ORDEREDSUBJECT", "ORDERED-SUBJECT"];
  for (const candidate of preferred) {
    if (algorithms.includes(candidate)) {
      return candidate;
    }
  }

  algorithms.sort();
  return algorithms[0] ?? null;
}

function dedupeThreadUIDs(uids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const uid of uids) {
    if (seen.has(uid)) {
      continue;
    }
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

function collectThreadUIDs(node: unknown, out: number[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectThreadUIDs(item, out);
    }
    return;
  }

  if (node && typeof node === "object") {
    const value = (node as { value?: unknown }).value;
    if (value !== undefined) {
      collectThreadUIDs(value, out);
      return;
    }
  }

  if (typeof node === "number" && Number.isInteger(node) && node > 0) {
    out.push(node);
    return;
  }

  if (typeof node === "string" && /^\d+$/.test(node)) {
    out.push(Number.parseInt(node, 10));
  }
}

function parseThreadFields(fields: unknown[]): number[][] {
  const threads: number[][] = [];
  for (const field of fields) {
    const uids: number[] = [];
    collectThreadUIDs(field, uids);
    const deduped = dedupeThreadUIDs(uids);
    if (deduped.length > 0) {
      threads.push(deduped);
    }
  }
  return threads;
}

async function executeThread(
  client: ImapFlow,
  algorithm: string,
  charset: string,
  criteria: SearchObject
): Promise<number[][]> {
  const criteriaArgs = searchCompiler(client as unknown, criteria);
  const attrs = [
    { type: "ATOM", value: algorithm.toUpperCase() },
    { type: "ATOM", value: charset },
    ...criteriaArgs
  ];

  const allThreads: number[][] = [];
  const response = await (client as unknown as {
    exec: (
      command: string,
      attributes: unknown[],
      options: { untagged: { THREAD: (untagged: { attributes?: unknown[] }) => Promise<void> } }
    ) => Promise<{ next?: () => void }>;
  }).exec("UID THREAD", attrs, {
    untagged: {
      THREAD: async (untagged: { attributes?: unknown[] }) => {
        const fields = Array.isArray(untagged?.attributes) ? untagged.attributes : [];
        allThreads.push(...parseThreadFields(fields));
      }
    }
  });

  response.next?.();
  return allThreads;
}

export class Service {
  constructor(private readonly connector: (cfg: Config) => Promise<ImapFlow> = connect) {}

  private async withClient<T>(cfg: Config, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = await this.connector(cfg);
    try {
      return await fn(client);
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }

  async status(cfg: Config, mailbox: string): Promise<{ messages: number; unseen: number }> {
    return this.withClient(cfg, async (client) => {
      const status = await client.status(mailbox, { messages: true, unseen: true });
      return {
        messages: status.messages ?? 0,
        unseen: status.unseen ?? 0
      };
    });
  }

  async listMailboxes(cfg: Config): Promise<string[]> {
    return this.withClient(cfg, async (client) => {
      const list = await client.list();
      return list.map((box) => box.path);
    });
  }

  async createMailbox(cfg: Config, name: string): Promise<void> {
    await this.withClient(cfg, async (client) => {
      await client.mailboxCreate(name);
    });
  }

  async listMessages(cfg: Config, mailbox: string, page: number, pageSize: number): Promise<{ messages: MessageSummary[]; total: number }> {
    return this.listMessagesWithCriteria(cfg, mailbox, { all: true }, page, pageSize);
  }

  async searchMessages(cfg: Config, mailbox: string, query: string, page: number, pageSize: number): Promise<{ messages: MessageSummary[]; total: number }> {
    return this.listMessagesWithCriteria(cfg, mailbox, { text: query }, page, pageSize);
  }

  async listThreads(_cfg: Config, _mailbox: string, _page: number, _pageSize: number): Promise<{ threads: ThreadSummary[]; total: number }> {
    return this.listThreadsWithCriteria(_cfg, _mailbox, { all: true }, _page, _pageSize);
  }

  async searchThreads(_cfg: Config, _mailbox: string, _query: string, _page: number, _pageSize: number): Promise<{ threads: ThreadSummary[]; total: number }> {
    return this.listThreadsWithCriteria(_cfg, _mailbox, { text: _query }, _page, _pageSize);
  }

  private async listMessagesWithCriteria(
    cfg: Config,
    mailbox: string,
    criteria: SearchObject,
    page: number,
    pageSize: number
  ): Promise<{ messages: MessageSummary[]; total: number }> {
    const normalized = normalizePage(page, pageSize);

    return this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });

      const uids = (await client.search(criteria, { uid: true })) || [];
      uids.sort((a, b) => a - b);

      const total = uids.length;
      if (total === 0) {
        return { messages: [], total: 0 };
      }

      const end = total - (normalized.page - 1) * normalized.pageSize;
      if (end <= 0) {
        return { messages: [], total };
      }

      const start = Math.max(0, end - normalized.pageSize);
      const subset = uids.slice(start, end);
      if (subset.length === 0) {
        return { messages: [], total };
      }

      const fetched: MessageSummary[] = [];
      for await (const msg of client.fetch(subset, { uid: true, envelope: true, flags: true, size: true }, { uid: true })) {
        fetched.push(fetchMessageToSummary(msg));
      }

      fetched.sort((a, b) => b.uid - a.uid);
      return { messages: fetched, total };
    });
  }

  private async listThreadsWithCriteria(
    cfg: Config,
    mailbox: string,
    criteria: SearchObject,
    page: number,
    pageSize: number
  ): Promise<{ threads: ThreadSummary[]; total: number }> {
    const normalized = normalizePage(page, pageSize);

    return this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });

      type ThreadMeta = { uids: number[]; latestUID: number };
      let allMeta: ThreadMeta[] = [];

      const threadAlgorithm = selectThreadAlgorithm(client.capabilities);
      if (threadAlgorithm) {
        let threadUIDs: number[][] = [];
        try {
          threadUIDs = await executeThread(client, threadAlgorithm, "UTF-8", criteria);
        } catch (err) {
          const text = err instanceof Error ? err.message.toUpperCase() : String(err).toUpperCase();
          const responseCode = (err as { responseCode?: string; serverResponseCode?: string })?.responseCode?.toUpperCase()
            ?? (err as { responseCode?: string; serverResponseCode?: string })?.serverResponseCode?.toUpperCase()
            ?? "";
          const badCharset = responseCode === "BADCHARSET" || text.includes("BADCHARSET");
          if (!badCharset) {
            throw err;
          }
          threadUIDs = await executeThread(client, threadAlgorithm, "US-ASCII", criteria);
        }

        allMeta = threadUIDs
          .filter((uids) => uids.length > 0)
          .map((uids) => ({ uids, latestUID: Math.max(...uids) }))
          .sort((a, b) => b.latestUID - a.latestUID);
      } else {
        const supportsThreadID = client.capabilities.has("OBJECTID") || client.capabilities.has("X-GM-EXT-1");
        if (!supportsThreadID) {
          throw ERR_THREAD_UNSUPPORTED;
        }

        const uids = (await client.search(criteria, { uid: true })) || [];
        uids.sort((a, b) => a - b);
        if (uids.length === 0) {
          return { threads: [], total: 0 };
        }

        const byThreadID = new Map<string, number[]>();
        let sawThreadID = false;

        for await (const msg of client.fetch(uids, { uid: true, threadId: true }, { uid: true })) {
          if (!msg.threadId) {
            continue;
          }
          sawThreadID = true;
          const key = String(msg.threadId);
          if (!byThreadID.has(key)) {
            byThreadID.set(key, []);
          }
          byThreadID.get(key)!.push(msg.uid);
        }

        if (!sawThreadID) {
          throw ERR_THREAD_UNSUPPORTED;
        }

        allMeta = [...byThreadID.values()]
          .filter((group) => group.length > 0)
          .map((uids) => ({ uids: dedupeThreadUIDs(uids), latestUID: Math.max(...uids) }))
          .sort((a, b) => b.latestUID - a.latestUID);
      }

      const total = allMeta.length;
      if (total === 0) {
        return { threads: [], total: 0 };
      }

      const start = (normalized.page - 1) * normalized.pageSize;
      if (start >= total) {
        return { threads: [], total };
      }
      const end = Math.min(start + normalized.pageSize, total);
      const pageMeta = allMeta.slice(start, end);

      const latestUIDs = pageMeta.map((entry) => entry.latestUID);
      const latestByUID = new Map<number, FetchMessageObject>();
      for await (const msg of client.fetch(latestUIDs, { uid: true, envelope: true }, { uid: true })) {
        latestByUID.set(msg.uid, msg);
      }

      const threads: ThreadSummary[] = pageMeta.map((entry) => {
        const msg = latestByUID.get(entry.latestUID);
        return {
          uid: entry.latestUID,
          count: entry.uids.length,
          subject: msg?.envelope?.subject ?? "",
          from: formatAddresses(msg?.envelope?.from),
          date: msg?.envelope?.date
        };
      });

      return { threads, total };
    });
  }

  async readMessage(cfg: Config, mailbox: string, uid: number): Promise<MessageDetail> {
    return this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });
      const message = await client.fetchOne(uid.toString(), { uid: true, envelope: true, source: true }, { uid: true });

      if (!message) {
        throw new Error(`message ${uid} not found`);
      }
      if (!message.source) {
        throw new Error("message body not available");
      }

      const parsed = await simpleParser(message.source);
      const htmlBody = typeof parsed.html === "string" ? parsed.html : "";
      const textBody = parsed.text || (htmlBody ? stripHTMLTags(htmlBody) : "");

      return {
        uid: message.uid,
        subject: message.envelope?.subject ?? "",
        from: formatAddresses(message.envelope?.from),
        to: formatAddresses(message.envelope?.to),
        cc: formatAddresses(message.envelope?.cc),
        date: message.envelope?.date,
        textBody,
        htmlBody,
        attachments: parsed.attachments.map((a) => a.filename || "")
      };
    });
  }

  async fetchRawMessage(cfg: Config, mailbox: string, uid: number): Promise<Buffer> {
    return this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });
      const downloaded = await client.download(uid.toString(), undefined, { uid: true });
      return streamToBuffer(downloaded.content);
    });
  }

  async deleteMessage(cfg: Config, mailbox: string, uid: number): Promise<void> {
    await this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: false });
      await client.messageDelete(uid.toString(), { uid: true });
    });
  }

  async moveMessage(cfg: Config, mailbox: string, uid: number, destination: string): Promise<void> {
    await this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: false });
      try {
        await client.messageMove(uid.toString(), destination, { uid: true });
      } catch {
        await client.messageCopy(uid.toString(), destination, { uid: true });
        await client.messageDelete(uid.toString(), { uid: true });
      }
    });
  }

  async addTag(cfg: Config, mailbox: string, uid: number, tag: string): Promise<void> {
    await this.withClient(cfg, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: false });
      await client.messageFlagsAdd(uid.toString(), [tag], { uid: true });
    });
  }

  async saveDraft(cfg: Config, mailbox: string, raw: Buffer): Promise<void> {
    await this.withClient(cfg, async (client) => {
      await client.append(mailbox, raw, [], new Date());
    });
  }

  async downloadAttachments(cfg: Config, mailbox: string, uid: number, dir: string): Promise<string[]> {
    const raw = await this.fetchRawMessage(cfg, mailbox, uid);
    await fs.mkdir(dir, { recursive: true, mode: 0o755 });

    const parsed = await simpleParser(raw);
    const saved: string[] = [];
    let idx = 1;

    for (const attachment of parsed.attachments) {
      const filename = attachment.filename?.trim() || `attachment-${idx}`;
      const target = await ensureUniqueFilename(path.join(dir, path.basename(filename)));
      await fs.writeFile(target, attachment.content);
      saved.push(target);
      idx += 1;
    }

    return saved;
  }
}

function fetchMessageToSummary(msg: FetchMessageObject): MessageSummary {
  return {
    uid: msg.uid,
    subject: msg.envelope?.subject ?? "",
    from: formatAddresses(msg.envelope?.from),
    date: msg.envelope?.date,
    size: msg.size,
    flags: Array.from(msg.flags ?? [])
  };
}

export async function connect(cfg: Config): Promise<ImapFlow> {
  const doSTARTTLS = cfg.imap.tls ? undefined : cfg.imap.starttls;

  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: cfg.imap.tls,
    doSTARTTLS,
    auth: {
      user: cfg.auth.username,
      pass: cfg.auth.password
    },
    tls: {
      rejectUnauthorized: !cfg.imap.insecure_skip_verify,
      servername: cfg.imap.host
    },
    logger: false
  });

  await client.connect();
  return client;
}
