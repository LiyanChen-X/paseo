import type { PluginAttachmentSearchPayload, RpcInput } from "@getpaseo/plugin";
import type { PluginSettings } from "@getpaseo/plugin/server";
import type { JiraIssue } from "../shared/issues";
import type { getIssueRpc, searchIssuesRpc, testConnectionRpc } from "../shared/issues";
import { connection, DEFAULT_JQL } from "../shared/settings";
import { createJiraClient, JiraApiError, type JiraClient } from "./jira";

type ConnectionSettings = PluginSettings<typeof connection.schema>;

interface ResolvedConnection {
  client: JiraClient;
  defaultJql: string;
}

// Environment variables win so a shared daemon can keep the token out of the settings file.
async function resolveConnection(settings: ConnectionSettings): Promise<ResolvedConnection> {
  const state = await settings.read();
  if (state.status === "invalid")
    throw new JiraApiError(`Jira settings are invalid: ${state.error}`);
  const values = state.values;
  const env = process.env;
  const client = createJiraClient({
    kind: env.JIRA_KIND === "server" || env.JIRA_KIND === "cloud" ? env.JIRA_KIND : values.kind,
    baseUrl: env.JIRA_BASE_URL ?? values.baseUrl,
    email: env.JIRA_EMAIL ?? values.email,
    token: env.JIRA_API_TOKEN ?? values.token,
  });
  return { client, defaultJql: values.defaultJql || DEFAULT_JQL };
}

function toAttachmentItem(issue: JiraIssue) {
  const subtitle = [issue.status, issue.assignee].filter(Boolean).join(" · ");
  return {
    id: issue.key,
    identifier: issue.key,
    title: issue.title,
    ...(subtitle ? { subtitle } : {}),
    url: issue.url,
    text: issue.text,
    resourceType: "issue",
  };
}

export function createIssueHandlers(settings: ConnectionSettings) {
  return {
    async search({
      query,
    }: RpcInput<typeof searchIssuesRpc>): Promise<PluginAttachmentSearchPayload> {
      const { client, defaultJql } = await resolveConnection(settings);
      const issues = await client.search(query, { defaultJql });
      return { items: issues.map(toAttachmentItem) };
    },
    async get({ key }: RpcInput<typeof getIssueRpc>) {
      const { client } = await resolveConnection(settings);
      return { issue: await client.get(key.toUpperCase()) };
    },
    async testConnection(_input: RpcInput<typeof testConnectionRpc>) {
      const { client } = await resolveConnection(settings);
      const me = await client.me();
      const state = await settings.read();
      const baseUrl =
        process.env.JIRA_BASE_URL ?? (state.status === "ready" ? state.values.baseUrl : "");
      return { displayName: me.displayName, baseUrl };
    },
  };
}
