import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import { IssueBrowser, useStartIssue } from "./issue-browser";

export function IssuesPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  const start = useStartIssue(navigation);
  const startMutate = start.mutate;
  const onStart = useCallback(
    (key: string) => startMutate({ key, workspaceId }),
    [startMutate, workspaceId],
  );
  return (
    <IssueBrowser
      theme={theme}
      compact={layout.compact}
      startingKey={start.isPending ? (start.variables?.key ?? null) : null}
      onStart={onStart}
    />
  );
}
