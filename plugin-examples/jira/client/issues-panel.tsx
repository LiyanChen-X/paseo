import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { IssueBrowser, useStartIssue } from "./issue-browser";

export function IssuesPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  const start = useStartIssue({ workspaceId, navigation });
  return <IssueBrowser theme={theme} compact={layout.compact} start={start} />;
}
