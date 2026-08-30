import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createTargetClient } from "./targetClient.js";
import { startPoller } from "./poller.js";
import { getBaseline } from "./baselineStore.js";
import { fingerprintTool } from "./fingerprint.js";
import {
  isGuardianTool,
} from "./tools/proxiedTool.js";
import {
  reviewPendingDriftTool,
  reviewPendingDrift,
} from "./tools/reviewPendingDrift.js";
import {
  approveToolChangeTool,
  approveToolChange,
} from "./tools/approveToolChange.js";

const app = express();
app.use(express.json());

const targetClient = await createTargetClient();

const server = new Server(
  {
    name: "mcp-trust-cop-guardian",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Return only Target tools that Guardian currently considers approved.
 *
 * Blocked tools are deliberately removed from the tools/list response.
 * This is the protocol-level enforcement mechanism.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = await targetClient.listTools();

  const approvedTools = [];

  for (const tool of result.tools) {
    const baseline = await getBaseline(tool.name);

    if (baseline?.status === "blocked_pending_review") {
      continue;
    }

    if (baseline?.status === "approved") {
      approvedTools.push(tool);
    }
  }

  return {
    tools: [
      ...approvedTools,
      reviewPendingDriftTool,
      approveToolChangeTool,
    ],
  };
});

/**
 * Handle Guardian-native tools and approved Target tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  /**
   * Guardian-native read-only drift report.
   */
  if (name === "review_pending_drift") {
    return reviewPendingDrift();
  }

  /**
   * Guardian-native approval/denial action.
   *
   * TrueForge sees destructiveHint: true on this tool and can therefore
   * apply its native approval flow.
   */
  if (name === "approve_tool_change") {
    const toolName = args.tool_name;

    const decision = args.decision;

    if (typeof toolName !== "string") {
      return {
        content: [
          {
            type: "text" as const,
            text: "tool_name is required.",
          },
        ],
        isError: true,
      };
    }

    if (decision !== "approve" && decision !== "deny") {
      return {
        content: [
          {
            type: "text" as const,
            text: 'decision must be either "approve" or "deny".',
          },
        ],
        isError: true,
      };
    }

    return approveToolChange(toolName, decision);
  }

  /**
   * Do not allow Guardian's internal tools to accidentally reach Target.
   */
  if (isGuardianTool(name)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Guardian tool handler not implemented: ${name}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Defense in depth:
   *
   * Before forwarding ANY Target tool call, re-fetch tools/list and
   * fingerprint the live definition. This protects against a mutation
   * occurring between the 3-second poll intervals.
   */
  const result = await targetClient.listTools();

  const liveTool = result.tools.find((tool) => tool.name === name);

  if (!liveTool) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Tool ${name} is not currently exposed by the target server.`,
        },
      ],
      isError: true,
    };
  }

  const baseline = await getBaseline(name);

  if (!baseline) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Tool ${name} has no approved baseline and cannot be called.`,
        },
      ],
      isError: true,
    };
  }

  if (baseline.status === "blocked_pending_review") {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Tool ${name} is blocked pending review because its definition ` +
            `changed after approval. Call review_pending_drift to inspect the change.`,
        },
      ],
      isError: true,
    };
  }

  const liveFingerprint = fingerprintTool(liveTool);

  if (liveFingerprint !== baseline.fingerprint) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Tool ${name} changed after approval and was blocked before execution. ` +
            `Call review_pending_drift to inspect the detected change.`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Everything checks out — forward the call to Target.
   */
  return targetClient.callTool({
    name,
    arguments: args,
  });
});

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Guardian MCP request error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "mcp-trust-cop-guardian",
  });
});

const PORT = 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Guardian MCP server running on http://localhost:${PORT}`,
  );
  console.log(
    `MCP endpoint: http://localhost:${PORT}/mcp`,
  );
  console.log(
    `Proxy target: http://localhost:4001/mcp`,
  );
});

startPoller();