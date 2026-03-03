export interface MessageSummary {
  uid: number;
  subject: string;
  from: string;
  date?: Date;
  size?: number;
  flags: string[];
}

export interface MessageDetail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date?: Date;
  textBody: string;
  htmlBody: string;
  attachments: string[];
}

export interface ThreadSummary {
  uid: number;
  count: number;
  subject: string;
  from: string;
  date?: Date;
}

export const ERR_THREAD_UNSUPPORTED = new Error("imap server does not support THREAD");
