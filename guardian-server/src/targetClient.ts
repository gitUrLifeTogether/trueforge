import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TARGET_URL = "http://localhost:4001/mcp";

export async function createTargetClient() {
  const client = new Client(
    {
      name: "mcp-trust-cop-guardian",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  const transport = new StreamableHTTPClientTransport(
    new URL(TARGET_URL),
  );

  await client.connect(transport);

  return client;
}