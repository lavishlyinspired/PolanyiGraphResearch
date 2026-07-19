import { describe, expect, it } from "vitest";
import { highlightMentions } from "./highlightMentions";

type MentionLike = { text: string; resolved_term: string | null };

function getMockMention(overrides?: Partial<MentionLike>): MentionLike {
  return { text: "Notional Amount", resolved_term: "Notional Amount", ...overrides };
}

describe("highlightMentions", () => {
  it("returns the whole text as one plain segment when there are no mentions", () => {
    expect(highlightMentions("Acme Corp reported earnings.", [])).toEqual([
      { text: "Acme Corp reported earnings.", kind: "plain" },
    ]);
  });

  it("marks a resolved mention's segment as resolved", () => {
    const segments = highlightMentions("The Notional Amount was high.", [getMockMention()]);
    expect(segments).toEqual([
      { text: "The ", kind: "plain" },
      { text: "Notional Amount", kind: "resolved" },
      { text: " was high.", kind: "plain" },
    ]);
  });

  it("marks an unresolved mention's segment as unresolved", () => {
    const segments = highlightMentions("Acme Corp reported earnings.", [
      getMockMention({ text: "Acme Corp", resolved_term: null }),
    ]);
    expect(segments).toEqual([
      { text: "Acme Corp", kind: "unresolved" },
      { text: " reported earnings.", kind: "plain" },
    ]);
  });

  it("highlights every occurrence of a repeated mention", () => {
    const segments = highlightMentions("Risk is risk. Risk matters.", [
      getMockMention({ text: "Risk", resolved_term: null }),
    ]);
    const highlighted = segments.filter((s) => s.kind === "unresolved").map((s) => s.text);
    expect(highlighted).toEqual(["Risk", "Risk"]);
  });

  it("prefers the longer mention over a shorter one it contains, regardless of input order", () => {
    const segments = highlightMentions("The Notional Amount was high.", [
      getMockMention({ text: "Amount", resolved_term: null }),
      getMockMention({ text: "Notional Amount", resolved_term: "Notional Amount" }),
    ]);
    // "Amount" must not also be separately highlighted inside "Notional Amount"
    expect(segments).toEqual([
      { text: "The ", kind: "plain" },
      { text: "Notional Amount", kind: "resolved" },
      { text: " was high.", kind: "plain" },
    ]);
  });

  it("prefers the longer mention when a shorter one is its literal prefix at the same position", () => {
    // Both candidates can start matching at the same "A" -- only sorting
    // longest-first (not input order) makes the longer one win here, since
    // regex alternation otherwise takes whichever alternative comes first.
    const segments = highlightMentions("The Amount Due was paid.", [
      getMockMention({ text: "Amount", resolved_term: null }),
      getMockMention({ text: "Amount Due", resolved_term: "Amount Due" }),
    ]);
    expect(segments).toEqual([
      { text: "The ", kind: "plain" },
      { text: "Amount Due", kind: "resolved" },
      { text: " was paid.", kind: "plain" },
    ]);
  });

  it("handles mention text containing regex-special characters safely", () => {
    const segments = highlightMentions("Growth was $2.5 million.", [
      getMockMention({ text: "$2.5 million", resolved_term: null }),
    ]);
    expect(segments).toEqual([
      { text: "Growth was ", kind: "plain" },
      { text: "$2.5 million", kind: "unresolved" },
      { text: ".", kind: "plain" },
    ]);
  });
});
