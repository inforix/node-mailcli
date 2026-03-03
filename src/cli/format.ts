import { MessageSummary, ThreadSummary } from "../imap/types.js";

function pad(n: number): string {
  return String(Math.trunc(Math.abs(n))).padStart(2, "0");
}

function formatRFC3339(date: Date): string {
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

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${tzHour}:${tzMinute}`;
}

function formatDate(date?: Date): string {
  if (!date) {
    return "";
  }
  return formatRFC3339(date);
}

export function printMessages(messages: MessageSummary[]): void {
  console.log("UID\tDATE\tFROM\tSUBJECT");
  for (const msg of messages) {
    console.log(`${msg.uid}\t${formatDate(msg.date)}\t${msg.from}\t${msg.subject}`);
  }
}

export function printThreads(threads: ThreadSummary[]): void {
  console.log("UID\tCOUNT\tDATE\tFROM\tSUBJECT");
  for (const thread of threads) {
    console.log(`${thread.uid}\t${thread.count}\t${formatDate(thread.date)}\t${thread.from}\t${thread.subject}`);
  }
}
