export interface IMAPConfig {
  host: string;
  port: number;
  tls: boolean;
  starttls: boolean;
  insecure_skip_verify: boolean;
}

export interface SMTPConfig {
  host: string;
  port: number;
  tls: boolean;
  starttls: boolean;
  insecure_skip_verify: boolean;
}

export interface AuthConfig {
  username: string;
  password?: string;
  passwordSource?: "env" | "config" | "secrets" | "flags" | "";
}

export interface DefaultsConfig {
  drafts_mailbox: string;
}

export interface Config {
  keyring_backend?: string;
  imap: IMAPConfig;
  smtp: SMTPConfig;
  auth: AuthConfig;
  defaults: DefaultsConfig;
}
