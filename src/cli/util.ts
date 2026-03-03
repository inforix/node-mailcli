import fs from "node:fs/promises";

export function splitList(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function loadBody(body: string, bodyFile: string): Promise<string> {
  if (!bodyFile) {
    return body;
  }

  if (body) {
    throw new Error("use either --body or --body-file");
  }

  if (bodyFile === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  return fs.readFile(bodyFile, "utf8");
}

export function parseUID(uidArg: string): number {
  const parsed = Number.parseInt(uidArg, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid uid: ${uidArg}`);
  }
  return parsed;
}
