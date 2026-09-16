import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_JQL =
  "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";

export const DEFAULT_START_PROMPT =
  "Work on the Jira issue below. Investigate the relevant code, implement the change, and run focused tests before reporting back.";

export const connection = defineSettings({
  id: "connection",
  scope: "host",
  version: 1,
  schema: z.object({
    // "cloud" targets Atlassian-hosted Jira (REST v3, Basic email:token auth).
    // "server" targets Jira Server / Data Center (REST v2, Bearer PAT or Basic auth).
    kind: z.enum(["cloud", "server"]).default("cloud"),
    baseUrl: z.string().trim().default(""),
    email: z.string().trim().default(""),
    token: z.string().default(""),
    defaultJql: z.string().trim().default(DEFAULT_JQL),
    // "provider/model" selection for agents started from an issue. Empty picks the first ready provider.
    provider: z.string().trim().default(""),
    startPrompt: z.string().trim().default(DEFAULT_START_PROMPT),
  }),
});

export type ConnectionValues = z.infer<typeof connection.schema>;
