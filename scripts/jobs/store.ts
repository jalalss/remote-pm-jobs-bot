// Raw-job store: persists fetched jobs (with their JDs) so classify + render can run
// independently of fetch. Map id -> RawJob plus firstSeenAt (when we first fetched it).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config } from "./config.js";
import type { RawJob } from "./types.js";

export type StoredJob = RawJob & { firstSeenAt: string };
export type RawStore = Record<string, StoredJob>;

export function loadRawStore(): RawStore {
  if (!existsSync(config.rawStorePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(config.rawStorePath, "utf8")) as RawStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRawStore(store: RawStore): void {
  writeFileSync(config.rawStorePath, JSON.stringify(store, null, 0), "utf8");
}
