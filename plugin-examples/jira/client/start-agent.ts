import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";
import type { JiraIssue } from "../shared/issues";
import { DEFAULT_START_PROMPT } from "../shared/settings";

type PaseoApi = PluginCommandCapabilities["paseo"];

export interface StartIssueAgentOptions {
  paseo: PaseoApi;
  workspaceId: string;
  issue: JiraIssue;
  /** "provider/model". Empty resolves the first ready provider's default model. */
  provider?: string;
  startPrompt?: string;
}

export async function resolveProvider(paseo: PaseoApi, preferred?: string): Promise<string> {
  const configured = preferred?.trim() ?? "";
  if (configured) return configured;
  const snapshot = await paseo.providers.snapshot();
  for (const entry of snapshot.entries) {
    if (entry.status !== "ready" || entry.enabled === false) continue;
    const models = entry.models ?? [];
    const model = models.find((candidate) => candidate.isDefault) ?? models[0];
    if (model) return `${entry.provider}/${model.id}`;
  }
  throw new Error("No ready agent provider. Set one in Settings → Jira or install a provider.");
}

export function buildStartPrompt(issue: JiraIssue, startPrompt?: string): string {
  const instruction = startPrompt?.trim() || DEFAULT_START_PROMPT;
  return `${instruction}\n\n${issue.text}`;
}

export async function startIssueAgent({
  paseo,
  workspaceId,
  issue,
  provider,
  startPrompt,
}: StartIssueAgentOptions): Promise<{ agentId: string }> {
  const selected = await resolveProvider(paseo, provider);
  const agent = await paseo.workspaces.ref(workspaceId).agents.create({
    config: { provider: selected },
    title: `${issue.key}: ${issue.title}`,
    prompt: buildStartPrompt(issue, startPrompt),
    labels: { "jira-issue": issue.key },
  });
  return { agentId: agent.id };
}
