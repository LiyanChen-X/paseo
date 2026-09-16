import { z } from "zod";
import { JIRA_ISSUE_KEY, type JiraIssue } from "../shared/issues";

export interface JiraClientOptions {
  kind: "cloud" | "server";
  baseUrl: string;
  email?: string;
  token: string;
  request?: typeof fetch;
}

export interface JiraClient {
  /** Resolves an exact key, runs JQL, or wraps free text into a JQL text search. */
  search(query: string, options: { defaultJql: string; maxResults?: number }): Promise<JiraIssue[]>;
  get(key: string): Promise<JiraIssue>;
  me(): Promise<{ displayName: string }>;
}

export class JiraApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraApiError";
  }
}

// Atlassian Document Format: Jira Cloud (REST v3) returns rich text as a node tree.
interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

const AdfNodeSchema: z.ZodType<AdfNode> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      content: z.array(AdfNodeSchema).optional(),
      attrs: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
);

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "tableRow",
  "rule",
  "panel",
  "mediaSingle",
]);

export function adfToText(node: AdfNode): string {
  const render = (current: AdfNode): string => {
    if (current.type === "text") return current.text ?? "";
    if (current.type === "hardBreak") return "\n";
    if (current.type === "mention") return String(current.attrs?.text ?? "");
    if (current.type === "emoji") return String(current.attrs?.shortName ?? "");
    if (current.type === "inlineCard") return String(current.attrs?.url ?? "");
    const inner = (current.content ?? []).map(render).join("");
    if (current.type === "listItem") return `- ${inner.trim()}\n`;
    if (current.type === "codeBlock") return `\`\`\`\n${inner}\n\`\`\`\n`;
    if (current.type === "tableCell" || current.type === "tableHeader") return `${inner} | `;
    return BLOCK_NODES.has(current.type ?? "") ? `${inner}\n` : inner;
  };
  return render(node)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NamedSchema = z.object({ name: z.string() }).passthrough();
const UserSchema = z
  .object({ displayName: z.string().optional(), name: z.string().optional() })
  .passthrough();
const CommentSchema = z
  .object({
    author: UserSchema.nullable().optional(),
    body: z.unknown().optional(),
    created: z.string(),
  })
  .passthrough();

const RawIssueSchema = z
  .object({
    key: z.string(),
    fields: z
      .object({
        summary: z.string(),
        description: z.unknown().nullable().optional(),
        status: NamedSchema.nullable().optional(),
        issuetype: NamedSchema.nullable().optional(),
        priority: NamedSchema.nullable().optional(),
        assignee: UserSchema.nullable().optional(),
        reporter: UserSchema.nullable().optional(),
        project: NamedSchema.nullable().optional(),
        labels: z.array(z.string()).optional(),
        comment: z
          .object({ comments: z.array(CommentSchema) })
          .nullable()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const SearchResponseSchema = z.object({ issues: z.array(RawIssueSchema) }).passthrough();
const MyselfSchema = UserSchema;
const ErrorBodySchema = z
  .object({
    errorMessages: z.array(z.string()).optional(),
    errors: z.record(z.string(), z.string()).optional(),
    message: z.string().optional(),
  })
  .passthrough();

const LIST_FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "reporter",
  "project",
  "labels",
];
const DETAIL_FIELDS = [...LIST_FIELDS, "comment"];
const MAX_COMMENTS = 5;

// Anything with an operator or JQL keyword is treated as JQL; other text becomes a text search.
const JQL_HINT = /[=~<>!()]|\b(?:in|is|was|not|and|or|order\s+by|changed|empty|null)\b/i;

function escapeJqlText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function toJql(query: string, defaultJql: string): string {
  const normalized = query.trim();
  if (!normalized) return defaultJql;
  if (JQL_HINT.test(normalized)) return normalized;
  return `text ~ "${escapeJqlText(normalized)}" ORDER BY updated DESC`;
}

function userName(user: z.infer<typeof UserSchema> | null | undefined): string | null {
  return user?.displayName ?? user?.name ?? null;
}

function richText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  const parsed = AdfNodeSchema.safeParse(value);
  return parsed.success ? adfToText(parsed.data) : "";
}

function describeHttpFailure(status: number, body: string): string {
  if (status === 401) return "Jira rejected the configured credentials (HTTP 401)";
  if (status === 403) return "Jira denied access with the configured credentials (HTTP 403)";
  if (status === 429) return "Jira rate limit reached. Try again shortly";
  let detail = "";
  try {
    const parsed = ErrorBodySchema.parse(JSON.parse(body));
    detail = [
      ...(parsed.errorMessages ?? []),
      ...Object.values(parsed.errors ?? {}),
      ...(parsed.message ? [parsed.message] : []),
    ].join("; ");
  } catch {
    detail = "";
  }
  return detail
    ? `Jira request failed (HTTP ${status}): ${detail}`
    : `Jira request failed with HTTP ${status}`;
}

export function createJiraClient(options: JiraClientOptions): JiraClient {
  const token = options.token.trim();
  const email = options.email?.trim() ?? "";
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new JiraApiError("Configure the Jira base URL in Settings → Jira");
  if (!/^https?:\/\//.test(baseUrl))
    throw new JiraApiError("The Jira base URL must start with http:// or https://");
  if (!token)
    throw new JiraApiError("Configure a Jira API token in Settings → Jira or set JIRA_API_TOKEN");
  if (options.kind === "cloud" && !email)
    throw new JiraApiError("Jira Cloud needs the account email that owns the API token");
  const request = options.request ?? fetch;
  const apiPath = options.kind === "cloud" ? "/rest/api/3" : "/rest/api/2";
  const authorization =
    options.kind === "cloud" || email
      ? `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`
      : `Bearer ${token}`;

  async function call(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const response = await request(`${baseUrl}${apiPath}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!response.ok)
      throw new JiraApiError(describeHttpFailure(response.status, await response.text()));
    return response.json();
  }

  function toIssue(raw: z.infer<typeof RawIssueSchema>): JiraIssue {
    const { fields } = raw;
    const comments = (fields.comment?.comments ?? []).slice(-MAX_COMMENTS).map((comment) => ({
      author: userName(comment.author) ?? "Unknown",
      body: richText(comment.body),
      created: comment.created,
    }));
    const issue = {
      key: raw.key,
      title: fields.summary,
      url: `${baseUrl}/browse/${raw.key}`,
      status: fields.status?.name ?? "Unknown",
      issueType: fields.issuetype?.name ?? "Issue",
      priority: fields.priority?.name ?? null,
      assignee: userName(fields.assignee),
      reporter: userName(fields.reporter),
      project: fields.project?.name ?? null,
      labels: fields.labels ?? [],
      description: richText(fields.description),
      comments,
    };
    return { ...issue, text: issueText(issue) };
  }

  async function searchJql(
    jql: string,
    maxResults: number,
    fields: string[],
  ): Promise<JiraIssue[]> {
    // Jira Cloud retired /search in favour of /search/jql; Server and Data Center keep /search.
    const path = options.kind === "cloud" ? "/search/jql" : "/search";
    const response = SearchResponseSchema.parse(
      await call(path, { method: "POST", body: { jql, maxResults, fields } }),
    );
    return response.issues.map(toIssue);
  }

  async function get(key: string): Promise<JiraIssue> {
    const raw = RawIssueSchema.parse(
      await call(`/issue/${encodeURIComponent(key)}?fields=${DETAIL_FIELDS.join(",")}`),
    );
    return toIssue(raw);
  }

  return {
    async search(query, { defaultJql, maxResults = 20 }) {
      const normalized = query.trim();
      if (JIRA_ISSUE_KEY.test(normalized)) {
        try {
          return [await get(normalized.toUpperCase())];
        } catch (error) {
          if (error instanceof JiraApiError && error.message.includes("HTTP 404")) return [];
          throw error;
        }
      }
      return searchJql(toJql(normalized, defaultJql), maxResults, LIST_FIELDS);
    },
    get,
    async me() {
      const me = MyselfSchema.parse(await call("/myself"));
      return { displayName: userName(me) ?? "Unknown" };
    },
  };
}

export function issueText(issue: Omit<JiraIssue, "text">): string {
  const lines = [
    `Jira ${issue.issueType} ${issue.key}: ${issue.title}`,
    `URL: ${issue.url}`,
    `Status: ${issue.status}`,
  ];
  if (issue.priority) lines.push(`Priority: ${issue.priority}`);
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee}`);
  if (issue.reporter) lines.push(`Reporter: ${issue.reporter}`);
  if (issue.project) lines.push(`Project: ${issue.project}`);
  if (issue.labels.length > 0) lines.push(`Labels: ${issue.labels.join(", ")}`);
  lines.push("", issue.description || "No description.");
  if (issue.comments.length > 0) {
    lines.push("", `Recent comments (${issue.comments.length}):`);
    for (const comment of issue.comments) {
      lines.push("", `${comment.author} (${comment.created}):`, comment.body || "(empty)");
    }
  }
  return lines.join("\n");
}
