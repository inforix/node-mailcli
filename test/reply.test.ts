import { describe, expect, it } from "vitest";
import { buildReplyHeaders, replySubject, stripHTMLTags } from "../src/email/reply.js";

describe("reply helpers", () => {
  it("keeps existing Re: subject", () => {
    expect(replySubject("Re: hello")).toBe("Re: hello");
  });

  it("adds Re: subject prefix", () => {
    expect(replySubject("hello")).toBe("Re: hello");
  });

  it("builds reply headers", () => {
    const headers = buildReplyHeaders({
      messageID: "<id@local>",
      references: "<old@local>",
      from: "",
      replyTo: "",
      to: [],
      cc: [],
      date: "",
      subject: "",
      body: "",
      bodyHTML: ""
    });

    expect(headers.inReplyTo).toBe("<id@local>");
    expect(headers.references).toContain("<old@local>");
    expect(headers.references).toContain("<id@local>");
  });

  it("strips html tags", () => {
    expect(stripHTMLTags("<div>Hello <b>World</b></div>")).toBe("Hello World");
  });
});
