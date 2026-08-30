import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createTargetClient } from "./targetClient.js";

import { startPoller } from "./poller.js";

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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = await targetClient.listTools();

  return {
    tools: result.tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await targetClient.callTool({
    name: request.params.name,
    arguments: request.params.arguments,
  });

  return result;
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
  console.log(`Guardian MCP server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Proxy target: http://localhost:4001/mcp`);
});

startPoller();