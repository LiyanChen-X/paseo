import { useMutation } from "@tanstack/react-query";
import {
  type PluginSurfaceProps,
  type SettingsState,
  useRpc,
  useSettings,
} from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { testConnectionRpc } from "../shared/issues";
import { connection, type ConnectionValues } from "../shared/settings";

type Ready = Extract<SettingsState<typeof connection.schema>, { status: "ready" }>;

const kinds = [
  { label: "Jira Cloud (Atlassian-hosted)", value: "cloud" },
  { label: "Jira Server / Data Center", value: "server" },
] as const;

export function ConnectionForm({
  settings,
  theme,
}: {
  settings: Ready;
  theme: PluginSurfaceProps["theme"];
}) {
  const toast = useToast();
  const testConnection = useRpc(testConnectionRpc);
  // Keep the loaded revision so a save from another client conflicts instead of overwriting.
  const [draft, setDraft] = useState(() => ({
    values: settings.values,
    revision: settings.revision,
  }));
  const [dirty, setDirty] = useState(false);
  const update = useCallback(<Key extends keyof ConnectionValues>(key: Key) => {
    return (value: ConnectionValues[Key]) => {
      setDirty(true);
      setDraft((current) => ({ ...current, values: { ...current.values, [key]: value } }));
    };
  }, []);
  const save = useCallback(() => {
    void (async () => {
      if (await settings.save(draft.values, draft.revision)) setDirty(false);
    })();
  }, [settings, draft]);
  const test = useMutation({
    mutationFn: () => testConnection({}),
    onSuccess: ({ displayName, baseUrl }) =>
      toast.show(`Connected to ${baseUrl} as ${displayName}`, {
        variant: "success",
        durationMs: 4000,
      }),
    onError: (error: Error) => toast.error(error.message),
  });
  const styles = useMemo(
    () => ({
      text: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );
  const isServer = draft.values.kind === "server";
  const runTest = useCallback(() => test.mutate(), [test]);
  const info = useMemo(
    () => (
      <Text style={styles.text}>
        JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_KIND in the daemon environment override
        these values.
      </Text>
    ),
    [styles],
  );

  return (
    <>
      <SettingsSection title="Connection" info={info}>
        <SettingsCard>
          <SettingsSelect
            label="Deployment"
            value={draft.values.kind}
            options={kinds}
            disabled={settings.saving}
            onValueChange={update("kind")}
          />
          <SettingsInput
            label="Base URL"
            hint={isServer ? "https://jira.example.com" : "https://your-site.atlassian.net"}
            initialValue={draft.values.baseUrl}
            placeholder="https://"
            disabled={settings.saving}
            onChangeText={update("baseUrl")}
          />
          <SettingsInput
            label={isServer ? "Username (optional)" : "Account email"}
            hint={
              isServer
                ? "Leave empty to send the token as a Bearer personal access token."
                : "The Atlassian account that owns the API token."
            }
            initialValue={draft.values.email}
            disabled={settings.saving}
            onChangeText={update("email")}
          />
          <SettingsInput
            label={isServer ? "Personal access token or password" : "API token"}
            initialValue={draft.values.token}
            secureTextEntry
            disabled={settings.saving}
            onChangeText={update("token")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Agents">
        <SettingsCard>
          <SettingsInput
            label="Default JQL"
            hint="Runs when the search box is empty."
            initialValue={draft.values.defaultJql}
            disabled={settings.saving}
            onChangeText={update("defaultJql")}
          />
          <SettingsInput
            label="Provider"
            hint="provider/model for agents started from an issue. Empty uses the first ready provider."
            initialValue={draft.values.provider}
            placeholder="claude/claude-sonnet-5"
            disabled={settings.saving}
            onChangeText={update("provider")}
          />
          <SettingsInput
            label="Start prompt"
            hint="Sent before the issue snapshot when an agent starts on an issue."
            initialValue={draft.values.startPrompt}
            disabled={settings.saving}
            onChangeText={update("startPrompt")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Actions">
        <SettingsCard>
          <SettingsAction
            label={dirty ? "Unsaved changes" : "Settings"}
            actionLabel={settings.saving ? "Saving…" : "Save"}
            disabled={settings.saving || !dirty}
            onPress={save}
          />
          <SettingsAction
            label="Verify the saved connection"
            actionLabel={test.isPending ? "Testing…" : "Test connection"}
            disabled={test.isPending || dirty}
            hint={dirty ? "Save first." : undefined}
            onPress={runTest}
          />
        </SettingsCard>
        {settings.saveError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {settings.saveError}
          </Text>
        ) : null}
      </SettingsSection>
    </>
  );
}

export function ConnectionSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(connection);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={style}>Loading Jira settings…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Jira">
        <Text style={style}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            onPress={settings.reset}
          />
        ) : null}
      </SettingsSection>
    );
  return <ConnectionForm key={settings.revision} settings={settings} theme={theme} />;
}
