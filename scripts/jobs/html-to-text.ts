// Minimal HTML -> plain text. Job descriptions arrive as HTML from most boards;
// the classifier only needs readable text, so a light strip is enough (no dep).

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function htmlToText(html: string): string {
  if (!html) return "";
  let text = html;

  // Turn common block/break tags into newlines so structure survives.
  text = text.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\s*li[^>]*>/gi, "\n- ");

  // Drop all remaining tags.
  text = text.replace(/<[^>]+>/g, " ");

  // Decode entities: named first, then numeric (decimal + hex).
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    text = text.replace(new RegExp(entity, "g"), char);
  }
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

  // Collapse whitespace: trim each line, drop consecutive blank lines.
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].trim().length > 0));

  return lines.join("\n").trim();
}
