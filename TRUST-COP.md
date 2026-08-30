Trust Cop — MCP Tool Governance & Drift Detection

A security gateway for Model Context Protocol (MCP) tools that detects unauthorized tool-definition changes, blocks affected tools, and requires explicit human approval before restoring them.

Overview

MCP allows AI agents to discover and invoke tools exposed by external servers. However, a tool can change after an agent has already trusted and approved it.

A seemingly small modification — such as adding a new input parameter, changing tool annotations, or modifying its description — can change the security assumptions surrounding that tool.

Trust Cop addresses this problem by placing a Guardian MCP server between the AI agent and the target MCP server.

Instead of allowing the agent to communicate directly with the target server, all tool discovery and execution passes through Guardian.

Guardian maintains an approved baseline for every tool, continuously monitors the target server for definition changes, and blocks tools whose definitions no longer match their approved baseline.

Problem

Traditional MCP tool approval generally happens when a tool is first exposed to an agent.

The problem is that the tool definition can change after approval.

For example:

Approved version

summarize_pr(pr_number)

Later, the target server changes to:

Modified version

summarize_pr(pr_number, debug)

Without a governance layer, an agent may continue using the modified tool without a new human review.

Trust Cop introduces a persistent trust boundary around MCP tools.

Solution

Trust Cop implements the following security workflow:

                    +------------------+
                    |     AI Agent     |
                    |    Trust Cop     |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  Guardian MCP    |
                    | Security Gateway |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
       Approved definition            Changed definition
              |                             |
              v                             v
       Forward to Target             Block the tool
                                            |
                                            v
                                    Pending Human Review
                                            |
                                  +---------+---------+
                                  |                   |
                                DENY                APPROVE
                                  |                   |
                                  v                   v
                               Remain             Restore new
                               blocked            definition

Core Features

1. Tool Fingerprinting

Guardian generates a SHA-256 fingerprint from the important parts of an MCP tool definition:

Tool name

Description

Input schema

Tool annotations

Objects are canonicalized before hashing so that differences in property ordering do not unnecessarily change the fingerprint.

Tool Definition
      |
      v
Canonicalization
      |
      v
SHA-256
      |
      v
Approved Fingerprint

2. Persistent Tool Baselines

When Guardian encounters a tool for the first time, it creates an approved baseline containing:

Fingerprint

Approval timestamp

Approved schema

Current status

Baselines are stored locally in:

guardian-server/data/baseline.json

3. Continuous Drift Detection

Guardian polls the target MCP server every 3 seconds.

If a tool's current fingerprint differs from its approved fingerprint, Guardian:

Detects the drift.

Stores the new definition as a pending schema.

Generates a human-readable diff.

Changes the tool status to blocked_pending_review.

Writes a drift_detected event to the audit log.

4. Protocol-Level Tool Blocking

Blocked tools are removed from Guardian's tools/list response.

Therefore, an agent cannot discover or normally invoke a tool while it is awaiting review.

For example:

Before drift:

get_open_prs
summarize_pr

After drift:

review_pending_drift
approve_tool_change

The changed tools are intentionally hidden until the review decision is made.

5. Defense-in-Depth Execution Check

Guardian does not rely only on the polling interval.

Immediately before forwarding a target tool call, Guardian:

Fetches the live target tool definition.

Finds the requested tool.

Loads its approved baseline.

Checks whether it is blocked.

Recomputes its live fingerprint.

Compares it with the approved fingerprint.

Only forwards the call if the fingerprints match.

This protects against a change occurring between two 3-second polling cycles.

6. Human Review

Guardian exposes two governance tools:

review_pending_drift

Displays tools currently blocked because their definitions changed.

The report includes:

Tool name

Blocked status

Detected changes

Definition diff

approve_tool_change

Allows an explicit decision:

approve

or:

deny

A denial keeps the tool blocked.

An approval promotes the pending definition to the new approved baseline and restores the tool.

7. Audit Logging

Security-relevant events are written to:

guardian-server/data/audit-log.jsonl

The prototype records events including:

drift_detected
drift_denied
drift_approved

Each event contains useful information such as:

Timestamp

Tool name

Definition diff

Previous fingerprint

Detected fingerprint

Human approval metadata

Example:

{
  "timestamp": "2026-08-30T15:20:53.435Z",
  "event": "drift_detected",
  "tool": "get_open_prs",
  "approvedFingerprint": "...",
  "detectedFingerprint": "..."
}

Demonstrated Attack Scenario

The prototype includes a deterministic V1/V2 mutation scenario.

V1 — Trusted State

The target exposes:

get_open_prs
summarize_pr

Guardian creates their approved baselines.

V2 — Tool Drift

The target server changes:

get_open_prs

Description changes and the readOnlyHint annotation is removed.

summarize_pr

A new optional parameter is introduced:

{
  "debug": {
    "type": "boolean",
    "description": "Enable debug output."
  }
}

Guardian Response

Guardian detects the changes and blocks both tools.

The agent can no longer access them through the normal Guardian tool surface.

The user can inspect the diff through:

review_pending_drift

and explicitly choose:

approve

or:

deny

Verification

The prototype has been tested end-to-end.

Drift Detection

V1 baseline
    |
V2 mutation
    |
drift_detected
    |
tools blocked

Denial

Human decision
    |
deny
    |
drift_denied
    |
tool remains blocked

Approval

Human decision
    |
approve
    |
drift_approved
    |
new definition becomes approved
    |
tool restored

Audit Trail

The resulting audit trail contains:

drift_detected
drift_detected
drift_denied
drift_approved

Project Structure

trueforge/
|
+-- agent-config/
|   +-- trust-cop-agent.json
|
+-- guardian-server/
|   +-- src/
|   |   +-- auditLog.ts
|   |   +-- baselineStore.ts
|   |   +-- fingerprint.ts
|   |   +-- poller.ts
|   |   +-- server.ts
|   |   +-- targetClient.ts
|   |   +-- tools/
|   |       +-- approveToolChange.ts
|   |       +-- proxiedTool.ts
|   |       +-- reviewPendingDrift.ts
|   |
|   +-- data/
|       +-- baseline.json
|       +-- audit-log.jsonl
|
+-- target-server/
    +-- mutate.flag
    +-- package.json
    +-- package-lock.json

Running the Prototype

Requirements

Node.js 22+

npm

TrueForge environment

MCP-compatible target server

Start Guardian

cd guardian-server
npm run dev

Guardian starts on:

http://localhost:4000

MCP endpoint:

http://localhost:4000/mcp

Guardian proxies requests to the target MCP server on:

http://localhost:4001/mcp

Health Check

Invoke-WebRequest http://localhost:4000/health -UseBasicParsing

Expected response:

{
  "status": "ok",
  "server": "mcp-trust-cop-guardian"
}

Demo Flow

The recommended demonstration is:

1. Start Target
2. Start Guardian
3. Establish V1 baseline
4. Show trusted tools
5. Trigger V2 mutation
6. Guardian detects drift
7. Show blocked tools
8. Run review_pending_drift
9. Show human-readable diff
10. Deny a change
11. Show audit log
12. Approve a change
13. Show the updated approved definition
14. Show audit log again

This demonstrates that tool trust is not permanent: it must be re-established whenever a tool definition changes.

Security Model

Trust Cop treats the approved tool definition as a security contract.

Approved Schema + Metadata
            |
            v
        Fingerprint
            |
            v
       Trust Baseline

A tool is executable only when:

Live Fingerprint
       ==
Approved Fingerprint

If the condition fails:

Execution -> BLOCKED

The user must explicitly review the change before the tool can be restored.

What This Prototype Detects

The current prototype detects changes to MCP tool definitions, specifically:

Description changes

Input schema changes

Annotation changes

Other changes represented in the fingerprinted tool definition

It also enforces the approved fingerprint immediately before execution.

Current Scope & Limitations

This prototype focuses on MCP tool-definition governance.

It does not claim to automatically detect every possible semantic or behavioral change inside a tool implementation.

For example, a server could potentially keep the same tool definition while changing its internal implementation. Detecting that class of change would require runtime behavioral analysis, controlled execution, and additional policy mechanisms.

The project is intentionally scoped around a strong and deterministic security primitive:

If an MCP tool's trusted definition changes, Guardian detects it and prevents execution until the change is reviewed.

Future Work

Potential extensions include:

Runtime behavioral fingerprinting

Automated sandbox probing of changed tools

Risk scoring for different drift types

Policy-based approval rules

Organization-wide trust registries

Remote audit storage

Cryptographically signed baselines

Multi-agent governance

Historical drift analytics

Automatic rollback of denied changes

Why Trust Cop?

AI agents increasingly depend on external tools.

The security question is therefore not only:

"Is this tool safe?"

but:

"Is this still the same tool that we previously trusted?"

Trust Cop introduces a lightweight governance layer that answers that question continuously.

Instead of silently trusting a changed MCP tool, the system:

Detects
   |
Blocks
   |
Explains
   |
Requests human approval
   |
Audits
   |
Restores only when approved

Trust should be continuous, not permanent.

Technology

TypeScript

Node.js

MCP SDK

Express

SHA-256 cryptographic hashing

Streamable HTTP

TrueForge

Gemini