import {
  defineAttachmentSource,
  defineRpc,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin";
import { z } from "zod";

export const JiraIssueSchema = z.object({
  key: z.string(),
  title: z.string(),
  url: z.string().url(),
  status: z.string(),
  issueType: z.string(),
  priority: z.string().nullable(),
  assignee: z.string().nullable(),
  reporter: z.string().nullable(),
  project: z.string().nullable(),
  labels: z.array(z.string()),
  description: z.string(),
  comments: z.array(z.object({ author: z.string(), body: z.string(), created: z.string() })),
  text: z.string(),
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export const searchIssuesRpc = defineRpc({
  name: "issues.search",
  input: z.object({ query: z.string() }),
  output: PluginAttachmentSearchPayloadSchema,
});

export const getIssueRpc = defineRpc({
  name: "issues.get",
  input: z.object({ key: z.string() }),
  output: z.object({ issue: JiraIssueSchema }),
});

export const testConnectionRpc = defineRpc({
  name: "connection.test",
  input: z.object({}),
  output: z.object({ displayName: z.string(), baseUrl: z.string() }),
});

export const issueAttachments = defineAttachmentSource({
  id: "issues",
  title: "Jira issue",
  icon: "SquareKanban",
  pickerTitle: "Attach Jira issue",
  searchPlaceholder: "Issue key, JQL, or text",
  search: searchIssuesRpc,
});

export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/i;
