import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { toolsV1 } from "./tools.v1.js";
import { toolsV2 } from "./tools.v2.js";
import { getTargetVersion } from "./mutate-flag.js";

const app = express();
app.use(express.json());

const server = new Server(
  {
    name: "mcp-trust-cop-target",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const version = await getTargetVersion();
  const tools = version === "v1" ? toolsV1 : toolsV2;

  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  const version = await getTargetVersion();
  const tools = version === "v1" ? toolsV1 : toolsV2;
  const tool = tools[name as keyof typeof tools];

  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  if (name === "get_open_prs") {
    return tool.handler();
  }

  if (name === "summarize_pr") {
    return tool.handler(
      args as { pr_number: number; debug?: boolean },
    );
  }

  return {
    content: [
      {
        type: "text",
        text: `Tool handler not implemented: ${name}`,
      },
    ],
    isError: true,
  };
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
    console.error("MCP request error:", error);

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
    server: "mcp-trust-cop-target",
    version: "v1",
  });
});

const PORT = 4001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Target MCP server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});