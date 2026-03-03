import nodemailer from "nodemailer";
import { Config } from "../types/config.js";

export async function sendSMTP(cfg: Config, from: string, recipients: string[], message: Buffer): Promise<void> {
  if (recipients.length === 0) {
    throw new Error("no recipients provided");
  }

  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.tls,
    requireTLS: !cfg.smtp.tls && cfg.smtp.starttls,
    auth: {
      user: cfg.auth.username,
      pass: cfg.auth.password
    },
    tls: {
      rejectUnauthorized: !cfg.smtp.insecure_skip_verify,
      servername: cfg.smtp.host
    }
  });

  await transport.sendMail({
    envelope: {
      from,
      to: recipients
    },
    raw: message
  });

  transport.close();
}
