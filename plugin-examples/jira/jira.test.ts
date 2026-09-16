import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { adfToText, createJiraClient, toJql } from "./server/jira";

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: Record<string, unknown> | null;
}

async function readRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return {
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization,
    body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
  };
}

async function withJiraServer<T>(
  respond: (request: CapturedRequest, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    void readRequest(request).then((captured) => respond(captured, response));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}/`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const cloudIssue = {
  key: "ENG-42",
  fields: {
    summary: "Attach Jira issues",
    description: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Let agents read " },
            { type: "text", text: "tickets." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Search" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Attach" }] }],
            },
          ],
        },
      ],
    },
    status: { name: "In Progress" },
    issuetype: { name: "Story" },
    priority: { name: "High" },
    assignee: { displayName: "Li Yan" },
    reporter: { displayName: "Sam" },
    project: { name: "Engineering" },
    labels: ["plugin"],
    comment: {
      comments: [
        {
          author: { displayName: "Sam" },
          created: "2026-09-01T10:00:00.000+0000",
          body: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Ship it." }] }],
          },
        },
      ],
    },
  },
};

describe("Jira client", () => {
  it("resolves an exact key on Jira Cloud with Basic auth and formats the snapshot", async () => {
    const issue = await withJiraServer(
      (request, response) => {
        expect(request.method).toBe("GET");
        expect(request.url).toBe(
          "/rest/api/3/issue/ENG-42?fields=summary,description,status,issuetype,priority,assignee,reporter,project,labels,comment",
        );
        expect(request.authorization).toBe(
          `Basic ${Buffer.from("me@example.com:token-123").toString("base64")}`,
        );
        sendJson(response, 200, cloudIssue);
      },
      async (baseUrl) => {
        const jira = createJiraClient({
          kind: "cloud",
          baseUrl,
          email: "me@example.com",
          token: "token-123",
        });
        const [found] = await jira.search("eng-42", { defaultJql: "order by updated" });
        return found;
      },
    );

    expect(issue).toMatchObject({
      key: "ENG-42",
      title: "Attach Jira issues",
      status: "In Progress",
      issueType: "Story",
      priority: "High",
      assignee: "Li Yan",
      labels: ["plugin"],
      description: "Let agents read tickets.\n- Search\n- Attach",
      comments: [{ author: "Sam", body: "Ship it." }],
    });
    expect(issue?.url).toMatch(/\/browse\/ENG-42$/);
    expect(issue?.text.split("\n")).toEqual([
      "Jira Story ENG-42: Attach Jira issues",
      `URL: ${issue?.url}`,
      "Status: In Progress",
      "Priority: High",
      "Assignee: Li Yan",
      "Reporter: Sam",
      "Project: Engineering",
      "Labels: plugin",
      "",
      "Let agents read tickets.",
      "- Search",
      "- Attach",
      "",
      "Recent comments (1):",
      "",
      "Sam (2026-09-01T10:00:00.000+0000):",
      "Ship it.",
    ]);
  });

  it("returns no items when an exact key does not exist", async () => {
    const items = await withJiraServer(
      (_request, response) => sendJson(response, 404, { errorMessages: ["Issue does not exist"] }),
      async (baseUrl) => {
        const jira = createJiraClient({
          kind: "cloud",
          baseUrl,
          email: "me@example.com",
          token: "t",
        });
        return jira.search("ENG-999", { defaultJql: "" });
      },
    );
    expect(items).toEqual([]);
  });

  it("runs JQL on Jira Server with a Bearer token and plain-text descriptions", async () => {
    const items = await withJiraServer(
      (request, response) => {
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/rest/api/2/search");
        expect(request.authorization).toBe("Bearer pat-1");
        expect(request.body).toMatchObject({
          jql: "project = ENG AND status = Open",
          maxResults: 20,
        });
        sendJson(response, 200, {
          issues: [
            {
              key: "ENG-7",
              fields: {
                summary: "Server issue",
                description: "Plain wiki text",
                status: { name: "Open" },
                issuetype: { name: "Bug" },
                assignee: null,
                labels: [],
              },
            },
          ],
        });
      },
      async (baseUrl) => {
        const jira = createJiraClient({ kind: "server", baseUrl: `${baseUrl}/`, token: "pat-1" });
        return jira.search("project = ENG AND status = Open", { defaultJql: "" });
      },
    );
    expect(items).toMatchObject([
      {
        key: "ENG-7",
        status: "Open",
        issueType: "Bug",
        priority: null,
        assignee: null,
        description: "Plain wiki text",
      },
    ]);
  });

  it("wraps free text into a JQL text search and uses the default JQL when empty", () => {
    expect(toJql("", "assignee = currentUser()")).toBe("assignee = currentUser()");
    expect(toJql("login crash", "x")).toBe('text ~ "login crash" ORDER BY updated DESC');
    expect(toJql('say "hi"', "x")).toBe('text ~ "say \\"hi\\"" ORDER BY updated DESC');
    expect(toJql("status = Done", "x")).toBe("status = Done");
    expect(toJql("sprint in openSprints()", "x")).toBe("sprint in openSprints()");
  });

  it("surfaces Jira error messages and credential failures", async () => {
    await expect(
      withJiraServer(
        (_request, response) =>
          sendJson(response, 400, { errorMessages: ["Field 'foo' does not exist."] }),
        async (baseUrl) => {
          const jira = createJiraClient({ kind: "cloud", baseUrl, email: "e", token: "t" });
          return jira.search("foo = 1", { defaultJql: "" });
        },
      ),
    ).rejects.toThrow("Jira request failed (HTTP 400): Field 'foo' does not exist.");
    await expect(
      withJiraServer(
        (_request, response) => sendJson(response, 401, {}),
        async (baseUrl) =>
          createJiraClient({ kind: "cloud", baseUrl, email: "e", token: "t" }).me(),
      ),
    ).rejects.toThrow("HTTP 401");
  });

  it("requires a base URL, token, and a Cloud email", () => {
    expect(() => createJiraClient({ kind: "cloud", baseUrl: "", email: "e", token: "t" })).toThrow(
      "base URL",
    );
    expect(() =>
      createJiraClient({
        kind: "cloud",
        baseUrl: "https://x.atlassian.net",
        email: "e",
        token: "",
      }),
    ).toThrow("JIRA_API_TOKEN");
    expect(() =>
      createJiraClient({
        kind: "cloud",
        baseUrl: "https://x.atlassian.net",
        email: "",
        token: "t",
      }),
    ).toThrow("email");
    expect(() =>
      createJiraClient({ kind: "server", baseUrl: "https://jira.example.com", token: "t" }),
    ).not.toThrow();
  });

  it("flattens ADF mentions, code blocks, and hard breaks", () => {
    expect(
      adfToText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mention", attrs: { text: "@Sam" } },
              { type: "text", text: " look" },
            ],
          },
          { type: "codeBlock", content: [{ type: "text", text: "npm test" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a" },
              { type: "hardBreak" },
              { type: "text", text: "b" },
            ],
          },
        ],
      }),
    ).toBe("@Sam look\n```\nnpm test\n```\na\nb");
  });
});
