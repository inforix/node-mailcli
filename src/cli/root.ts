import { Command } from "commander";
import { newAttachmentsCmd } from "./attachments.js";
import { newAuthCmd } from "./auth.js";
import { newConfigCmd } from "./config.js";
import { newDeleteCmd } from "./delete.js";
import { newDraftCmd } from "./draft.js";
import { newInboxCmd, newMailCmd } from "./mail-list.js";
import { newMailboxesCmd } from "./mailboxes.js";
import { newMoveCmd } from "./move.js";
import { newReadCmd } from "./read.js";
import { newSearchCmd } from "./search.js";
import { newSendCmd } from "./send.js";
import { newStatusCmd } from "./status.js";
import { newTagCmd } from "./tag.js";

export function newRootCmd(): Command {
  const cmd = new Command();
  cmd.name("mailcli").description("mailcli is a CLI for IMAP/SMTP mail servers");

  cmd.addCommand(newAuthCmd());
  cmd.addCommand(newStatusCmd());
  cmd.addCommand(newInboxCmd());
  cmd.addCommand(newMailCmd());
  cmd.addCommand(newReadCmd());
  cmd.addCommand(newSearchCmd());
  cmd.addCommand(newSendCmd());
  cmd.addCommand(newDraftCmd());
  cmd.addCommand(newDeleteCmd());
  cmd.addCommand(newMoveCmd());
  cmd.addCommand(newTagCmd());
  cmd.addCommand(newMailboxesCmd());
  cmd.addCommand(newAttachmentsCmd());
  cmd.addCommand(newConfigCmd());

  cmd.showSuggestionAfterError(false);
  cmd.showHelpAfterError(false);

  return cmd;
}

export async function execute(argv = process.argv): Promise<void> {
  const root = newRootCmd();
  await root.parseAsync(argv);
}
