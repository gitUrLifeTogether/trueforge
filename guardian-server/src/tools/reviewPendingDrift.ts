import { getAllBaselines } from "../baselineStore.js";

export const reviewPendingDriftTool = {
  name: "review_pending_drift",
  description:
    "Shows tools that Guardian blocked because their definitions changed after approval.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
  },
};

export async function reviewPendingDrift() {
  const baselines = await getAllBaselines();

  const pending = Object.entries(baselines).filter(
    ([, baseline]) => baseline.status === "blocked_pending_review",
  );

  if (pending.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No tools are currently blocked pending review.",
        },
      ],
    };
  }

  const report = pending
    .map(([toolName, baseline]) =>
      [
        `Tool: ${toolName}`,
        "Status: blocked_pending_review",
        "",
        "Detected changes:",
        baseline.diff ?? "No diff available.",
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  return {
    content: [
      {
        type: "text" as const,
        text: report,
      },
    ],
  };
}