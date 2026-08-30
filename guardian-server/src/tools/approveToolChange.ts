import {
  getBaseline,
  saveBaseline,
} from "../baselineStore.js";

export const approveToolChangeTool = {
  name: "approve_tool_change",
  description:
    "Approve or deny a detected tool definition change. Approval restores the tool using the pending definition.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description: "The name of the tool with pending drift.",
      },
      decision: {
        type: "string",
        enum: ["approve", "deny"],
        description: "Whether to approve or deny the detected change.",
      },
    },
    required: ["tool_name", "decision"],
    additionalProperties: false,
  },
  annotations: {
    destructiveHint: true,
  },
};

export async function approveToolChange(
  toolName: string,
  decision: "approve" | "deny",
) {
  const baseline = await getBaseline(toolName);

  if (!baseline) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No baseline exists for tool: ${toolName}`,
        },
      ],
      isError: true,
    };
  }

  if (baseline.status !== "blocked_pending_review") {
    return {
      content: [
        {
          type: "text" as const,
          text: `Tool ${toolName} is not currently blocked pending review.`,
        },
      ],
      isError: true,
    };
  }

  if (!baseline.pendingSchema) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Tool ${toolName} has no pending schema to review.`,
        },
      ],
      isError: true,
    };
  }

  if (decision === "deny") {
    await saveBaseline(toolName, {
      ...baseline,
      status: "blocked_pending_review",
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Denied change for ${toolName}. The tool remains blocked.`,
        },
      ],
    };
  }

  await saveBaseline(toolName, {
    fingerprint: baseline.fingerprint,
    approvedAt: new Date().toISOString(),
    approvedSchema: baseline.pendingSchema,
    status: "approved",
  });

  return {
    content: [
      {
        type: "text" as const,
        text: `Approved change for ${toolName}. The tool has been restored with its new definition.`,
      },
    ],
  };
}