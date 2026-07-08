// Dedupe / result cache: maps job id -> its classification. Re-runs reuse cached
// classifications (no Claude call) and only classify jobs not seen before, while
// still rendering a complete digest. Jobs absent from the current pull are pruned.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config } from "./config.js";
import type { Classification } from "./types.js";

export type Cache = Record<string, Classification>;

export function loadCache(): Cache {
  if (!existsSync(config.cachePath)) return {};
  try {
    const raw = readFileSync(config.cachePath, "utf8");
    const parsed = JSON.parse(raw) as Cache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCache(cache: Cache): void {
  writeFileSync(config.cachePath, JSON.stringify(cache, null, 0), "utf8");
}
