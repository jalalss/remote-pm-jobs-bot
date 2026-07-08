// Free (no-LLM) language check via franc. A job whose description is written
// predominantly in a non-English language signals a local-market role -> REJECT.
import { franc } from "franc";

// franc returns ISO 639-3 codes: 'eng' = English, 'und' = undetermined.
export function detectLang(text: string): string {
  const sample = (text ?? "").trim();
  if (sample.length < 40) return "und"; // too short to judge
  return franc(sample, { minLength: 20 });
}

/** True only when franc confidently detects a non-English language (undetermined -> false). */
export function isNonEnglish(text: string): boolean {
  const lang = detectLang(text);
  return lang !== "eng" && lang !== "und";
}

/** A short one-line verbatim snippet of the description, for evidence. */
export function snippet(text: string, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
