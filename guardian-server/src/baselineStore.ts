import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ToolStatus = "approved" | "blocked_pending_review";

export type ToolBaseline = {
  fingerprint: string;
  approvedAt: string;
  approvedSchema: Record<string, unknown>;
  status: ToolStatus;
  pendingSchema?: Record<string, unknown>;
  diff?: string;
};

type BaselineData = Record<string, ToolBaseline>;

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const BASELINE_PATH = path.join(DATA_DIR, "baseline.json");

async function ensureStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(BASELINE_PATH, "utf8");
  } catch {
    await writeFile(BASELINE_PATH, "{}\n", "utf8");
  }
}

async function readStore(): Promise<BaselineData> {
  await ensureStore();

  const contents = await readFile(BASELINE_PATH, "utf8");
  return JSON.parse(contents) as BaselineData;
}

async function writeStore(data: BaselineData): Promise<void> {
  await ensureStore();
  await writeFile(BASELINE_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function getBaseline(
  toolName: string,
): Promise<ToolBaseline | undefined> {
  const data = await readStore();
  return data[toolName];
}

export async function getAllBaselines(): Promise<BaselineData> {
  return readStore();
}

export async function saveBaseline(
  toolName: string,
  baseline: ToolBaseline,
): Promise<void> {
  const data = await readStore();
  data[toolName] = baseline;
  await writeStore(data);
}

export async function approveInitialTool({
  toolName,
  fingerprint,
  toolSchema,
}: {
  toolName: string;
  fingerprint: string;
  toolSchema: Record<string, unknown>;
}): Promise<void> {
  await saveBaseline(toolName, {
    fingerprint,
    approvedAt: new Date().toISOString(),
    approvedSchema: toolSchema,
    status: "approved",
  });
}

export async function markDriftPending({
  toolName,
  fingerprint,
  pendingSchema,
  diff,
}: {
  toolName: string;
  fingerprint: string;
  pendingSchema: Record<string, unknown>;
  diff: string;
}): Promise<void> {
  const data = await readStore();
  const existing = data[toolName];

  if (!existing) {
    throw new Error(
      `Cannot mark drift for tool without a baseline: ${toolName}`,
    );
  }

  data[toolName] = {
    ...existing,
    fingerprint,
    status: "blocked_pending_review",
    pendingSchema,
    diff,
  };

  await writeStore(data);
}