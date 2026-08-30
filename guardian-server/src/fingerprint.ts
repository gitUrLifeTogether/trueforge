import { createHash } from "node:crypto";

export function fingerprintTool(tool: {
  name: string;
  description?: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
}): string {
  // Canonicalize: stable key order, so formatting changes alone don't
  // register as drift, but any semantic change does.
  const canonical = JSON.stringify(
    {
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      annotations: tool.annotations ?? {},
    },
    Object.keys(tool).sort(),
  );

  return createHash("sha256").update(canonical).digest("hex");
}