import { toggleTargetVersion } from "../src/mutate-flag.js";

const version = await toggleTargetVersion();

console.log(`Target MCP server mutated to ${version}`);