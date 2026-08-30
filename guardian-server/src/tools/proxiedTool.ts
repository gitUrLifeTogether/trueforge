export function isGuardianTool(toolName: string): boolean {
  return (
    toolName === "review_pending_drift" ||
    toolName === "approve_tool_change"
  );
}