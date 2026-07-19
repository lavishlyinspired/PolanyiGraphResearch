export type TextSegment = { text: string; kind: "plain" | "resolved" | "unresolved" };

type MentionLike = { text: string; resolved_term: string | null };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits `text` into segments so the original document can render each
 * mention highlighted by whether it resolved to a real glossary term — pure
 * substring matching against real mention data, never inferring a match the
 * backend didn't report. Longer mentions are matched before ones they
 * contain (e.g. "Notional Amount" before "Amount"), and every occurrence of
 * a repeated mention is highlighted, not just the first. */
export function highlightMentions(text: string, mentions: MentionLike[]): TextSegment[] {
  if (mentions.length === 0) {
    return [{ text, kind: "plain" }];
  }

  const kindByText = new Map<string, "resolved" | "unresolved">(
    mentions.map((m) => [m.text, m.resolved_term !== null ? "resolved" : "unresolved"]),
  );
  const sortedByLengthDesc = [...mentions].sort((a, b) => b.text.length - a.text.length);
  const pattern = new RegExp(sortedByLengthDesc.map((m) => escapeRegExp(m.text)).join("|"), "g");

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), kind: "plain" });
    }
    segments.push({ text: match[0], kind: kindByText.get(match[0]) ?? "plain" });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), kind: "plain" });
  }
  return segments;
}
