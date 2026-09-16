import type { PluginClientContext } from "@getpaseo/plugin/client";
import { IssuesPanel } from "./client/issues-panel";
import { ConnectionSettings } from "./client/settings";
import { startIssueAgent } from "./client/start-agent";
import { getIssueRpc, issueAttachments, JIRA_ISSUE_KEY } from "./shared/issues";

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(issueAttachments);
  client.addSettingsScreen({
    id: "connection",
    title: "Jira",
    icon: "SquareKanban",
    Component: ConnectionSettings,
  });
  client.addWorkspacePanel({
    id: "issues",
    title: "Jira issues",
    icon: "SquareKanban",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: IssuesPanel,
  });
  client.addCommandCenterItem({
    id: "open-issues",
    title: "Start agent from Jira issue",
    icon: "SquareKanban",
    keywords: ["jira", "ticket", "issue"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("issues");
    },
  });
  client.addCommandCenterItem({
    id: "settings",
    title: "Configure Jira connection",
    icon: "Settings",
    keywords: ["jira"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("connection");
    },
  });
  client.addSlashCommand({
    name: "jira",
    description: "Start an agent on a Jira issue",
    argumentHint: "<ISSUE-KEY>",
    context: "workspace",
    async onSubmit({ args, paseo, rpc, workspace }) {
      const key = args.trim().toUpperCase();
      if (!JIRA_ISSUE_KEY.test(key)) throw new Error("Usage: /jira PROJ-123");
      const { issue } = await rpc(getIssueRpc, { key });
      await startIssueAgent({ paseo, workspaceId: workspace.id, issue });
    },
  });
  return () => {};
}
