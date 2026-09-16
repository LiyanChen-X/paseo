# Jira plugin example

This example connects Paseo to Jira Cloud or Jira Server / Data Center and adds:

- **Attach Jira issue** in the composer attachment menu. Type an issue key, JQL, or plain text; an
  empty search runs your default JQL. The selected issue is sent to the agent as a text snapshot.
- A **Jira issues** workspace panel (also available in Explorer) that lists issues for a search and
  starts an agent on one with a single tap.
- The `/jira PROJ-123` slash command, which loads that issue and starts an agent on it in the
  current workspace.
- Command Center items **Start agent from Jira issue** and **Configure Jira connection**.
- A **Jira** sidebar page. Unconfigured, it shows one setup card whose **Connect** button saves and
  verifies the credentials in a single step. Connected, it shows the site and signed-in user, a
  search box, and the issue list; **Start agent** asks which workspace to use when more than one is
  open.
- A **Jira** settings screen for the same connection plus default JQL, agent provider, and start
  prompt. Both surfaces read and write one host-scoped settings document.

## Configure

Turn on **Enable plugins** in **Settings → Plugins**, then install the example:

```bash
paseo plugin add /absolute/path/to/paseo/plugin-examples/jira
paseo plugin ls jira
```

Open **Jira** in the sidebar and fill in the setup card (or use **Settings → Jira**):

| Deployment                | Base URL                          | Credentials                                                                                     |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Jira Cloud                | `https://your-site.atlassian.net` | Account email plus an [API token](https://id.atlassian.com/manage-profile/security/api-tokens). |
| Jira Server / Data Center | `https://jira.example.com`        | A personal access token (leave username empty), or username plus password.                      |

**Connect** saves and verifies in one step; **Settings → Jira** has a separate **Test connection**
row. Settings are stored as plain JSON on the daemon
host. To keep the token out of that file, set these in the daemon environment instead; they
override the saved values:

```bash
export JIRA_BASE_URL="https://your-site.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="..."
export JIRA_KIND="cloud"   # or "server"
```

## How it works

- `shared/settings.ts` defines the host-scoped connection settings.
- `shared/issues.ts` defines the search, get, and test-connection RPCs plus the attachment source.
- `server/jira.ts` is the REST client. Cloud uses `/rest/api/3` with Basic auth and converts
  Atlassian Document Format descriptions to text; Server uses `/rest/api/2` with Bearer or Basic
  auth. Exact keys fetch one issue with recent comments; everything else runs as JQL.
- `server/issues.ts` resolves settings and environment, then handles the RPCs in the daemon.
- `client/use-connection-draft.ts` owns draft, save, and verify state; `client/connect-card.tsx`
  (sidebar) and `client/settings.tsx` (host rows) are two views over it. `client/issue-browser.tsx`
  owns search, the issue list, and the start-agent mutation; the sidebar surface and the workspace
  panel compose it.
- `client/start-agent.ts` creates the agent through `paseo.workspaces.ref(id).agents.create` with
  the start prompt followed by the issue snapshot. It uses the configured `provider/model` or the
  first ready provider.

Run `paseo plugin reload jira` after source edits. Run the tests with:

```bash
npx vitest run plugin-examples/jira/jira.test.ts
```
