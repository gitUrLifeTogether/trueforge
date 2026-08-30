import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const AUDIT_LOG_PATH = path.join(DATA_DIR, "audit-log.jsonl");

export type AuditEvent = {
  timestamp?: string;
  event: string;
  tool: string;
  [key: string]: unknown;
};

export async function auditLog(
  event: string,
  tool: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const entry: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    tool,
    ...extra,
  };

  await appendFile(
    AUDIT_LOG_PATH,
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );
}