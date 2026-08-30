import { fingerprintTool } from "./fingerprint.js";
import {
  approveInitialTool,
  getBaseline,
  markDriftPending,
} from "./baselineStore.js";
import { createTargetClient } from "./targetClient.js";

const POLL_INTERVAL_MS = 3000;

function toolSnapshot(tool: {
  name: string;
  description?: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema,
    annotations: tool.annotations ?? {},
  };
}

function createDiff(
  oldTool: Record<string, unknown>,
  newTool: Record<string, unknown>,
): string {
  const changes: string[] = [];

  if (oldTool.description !== newTool.description) {
    changes.push(
      `description changed:\n- ${String(oldTool.description ?? "")}\n+ ${String(newTool.description ?? "")}`,
    );
  }

  if (
    JSON.stringify(oldTool.inputSchema) !==
    JSON.stringify(newTool.inputSchema)
  ) {
    changes.push(
      `inputSchema changed:\n- ${JSON.stringify(oldTool.inputSchema, null, 2)}\n+ ${JSON.stringify(newTool.inputSchema, null, 2)}`,
    );
  }

  if (
    JSON.stringify(oldTool.annotations) !==
    JSON.stringify(newTool.annotations)
  ) {
    changes.push(
      `annotations changed:\n- ${JSON.stringify(oldTool.annotations, null, 2)}\n+ ${JSON.stringify(newTool.annotations, null, 2)}`,
    );
  }

  return changes.length > 0
    ? changes.join("\n\n")
    : "Tool definition changed.";
}

async function checkForDrift(): Promise<void> {
  const targetClient = await createTargetClient();

  try {
    const result = await targetClient.listTools();

    for (const tool of result.tools) {
      const snapshot = toolSnapshot(tool);
      const fingerprint = fingerprintTool(tool);
      const baseline = await getBaseline(tool.name);

      if (!baseline) {
        await approveInitialTool(tool.name, fingerprint, snapshot);

        console.log(
          `[Guardian] Initial baseline approved: ${tool.name}`,
        );

        continue;
      }

      if (baseline.status === "blocked_pending_review") {
        continue;
      }

      if (baseline.fingerprint === fingerprint) {
        continue;
      }

      const diff = createDiff(baseline.approvedSchema, snapshot);

      await markDriftPending(
        tool.name,
        fingerprint,
        snapshot,
        diff,
      );

      console.log(
        `[Guardian] 🚨 DRIFT DETECTED: ${tool.name}`,
      );
      console.log(diff);
    }
  } finally {
    await targetClient.close();
  }
}

export function startPoller(): void {
  console.log(
    `[Guardian] Starting tool fingerprint poller (${POLL_INTERVAL_MS}ms)`,
  );

  void checkForDrift().catch(error => {
    console.error("[Guardian] Initial poll failed:", error);
  });

  setInterval(() => {
    void checkForDrift().catch(error => {
      console.error("[Guardian] Poll failed:", error);
    });
  }, POLL_INTERVAL_MS);
}