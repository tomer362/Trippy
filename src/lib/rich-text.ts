/**
 * Turns the editor's stored JSON document into plain paragraphs.
 *
 * The public story page is a server component and does not need an editor, so it renders the
 * text itself rather than shipping the whole rich-text bundle to a reader.
 */

type Node = { type?: string; text?: string; content?: Node[] };

const BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock"]);

function textOf(node: Node): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textOf).join("");
}

/** Flattens a document into one string per block, dropping empties. */
export function richTextToParagraphs(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.type && BLOCKS.has(node.type)) {
      const text = textOf(node).trim();
      if (text) out.push(text);
      return; // Block text is already gathered; do not descend and repeat it.
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc as Node);
  return out;
}

/** A one-line preview, for cards and meta descriptions. */
export function richTextToSnippet(doc: unknown, maxChars = 160): string {
  const text = richTextToParagraphs(doc).join(" ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}…`;
}
