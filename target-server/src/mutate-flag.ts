import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FLAG_PATH = fileURLToPath(
  new URL("../mutate.flag", import.meta.url),
);

export type TargetVersion = "v1" | "v2";

export async function getTargetVersion(): Promise<TargetVersion> {
  const value = (await readFile(FLAG_PATH, "utf8")).trim();

  if (value === "v1" || value === "v2") {
    return value;
  }

  throw new Error(`Invalid mutate.flag value: ${value}`);
}

export async function setTargetVersion(
  version: TargetVersion,
): Promise<void> {
  await writeFile(FLAG_PATH, `${version}\n`, "utf8");
}

export async function toggleTargetVersion(): Promise<TargetVersion> {
  const current = await getTargetVersion();
  const next = current === "v1" ? "v2" : "v1";

  await setTargetVersion(next);

  return next;
}