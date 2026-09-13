import { describe, expect, it } from "vitest";
import { richTextToParagraphs, richTextToSnippet } from "./rich-text";

const doc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Landed at noon." }] },
    { type: "paragraph", content: [] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Coffee at Fabrica" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Tram 28" }] }],
        },
      ],
    },
  ],
};

describe("richTextToParagraphs", () => {
  it("flattens blocks and drops empty ones", () => {
    expect(richTextToParagraphs(doc)).toEqual(["Landed at noon.", "Coffee at Fabrica", "Tram 28"]);
  });

  it("joins marked runs inside a paragraph into one string", () => {
    const marked = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Really " },
            { type: "text", text: "good", marks: [{ type: "bold" }] },
            { type: "text", text: " pastries" },
          ],
        },
      ],
    };
    expect(richTextToParagraphs(marked)).toEqual(["Really good pastries"]);
  });

  it("does not repeat a list item's text once as the item and again as its paragraph", () => {
    const paragraphs = richTextToParagraphs(doc);
    expect(paragraphs.filter((p) => p === "Tram 28")).toHaveLength(1);
  });

  it("returns nothing for null, a string, or an empty document", () => {
    expect(richTextToParagraphs(null)).toEqual([]);
    expect(richTextToParagraphs("not a doc")).toEqual([]);
    expect(richTextToParagraphs({ type: "doc", content: [] })).toEqual([]);
  });
});

describe("richTextToSnippet", () => {
  it("returns short text unchanged", () => {
    expect(richTextToSnippet(doc)).toBe("Landed at noon. Coffee at Fabrica Tram 28");
  });

  it("truncates on a character budget with an ellipsis", () => {
    const snippet = richTextToSnippet(doc, 20);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(21);
  });
});
