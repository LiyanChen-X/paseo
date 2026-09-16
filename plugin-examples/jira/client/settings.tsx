import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo } from "react";
import { Text } from "react-native";
import { connection } from "../shared/settings";
import {
  deploymentOptions,
  type ReadyConnection,
  useConnectionDraft,
} from "./use-connection-draft";

/** Host settings screen. Same settings document as the sidebar page, rendered in host rows. */
function ConnectionRows({
  settings,
  theme,
}: {
  settings: ReadyConnection;
  theme: PluginSurfaceProps["theme"];
}) {
  const toast = useToast();
  const draft = useConnectionDraft(settings);
  const isServer = draft.values.kind === "server";
  const verify = useCallback(() => {
    draft.verify.mutate(undefined, {
      onSuccess: ({ displayName }) =>
        toast.show(`Connected as ${displayName}`, { variant: "success" }),
      onError: (error: Error) => toast.error(error.message),
    });
  }, [draft.verify, toast]);
  const save = useCallback(() => void draft.save(), [draft]);
  const errorStyle = useMemo(() => ({ color: theme.colors.statusDanger }), [theme]);

  return (
    <>
      <SettingsSection title="Connection">
        <SettingsCard>
          <SettingsSelect
            label="Deployment"
            value={draft.values.kind}
            options={deploymentOptions}
            disabled={draft.saving}
            onValueChange={draft.update("kind")}
          />
          <SettingsInput
            label="Site URL"
            initialValue={draft.values.baseUrl}
            placeholder={isServer ? "https://jira.example.com" : "https://your-site.atlassian.net"}
            disabled={draft.saving}
            onChangeText={draft.update("baseUrl")}
          />
          <SettingsInput
            label={isServer ? "Username" : "Email"}
            hint={isServer ? "Optional with a personal access token." : undefined}
            initialValue={draft.values.email}
            disabled={draft.saving}
            onChangeText={draft.update("email")}
          />
          <SettingsInput
            label={isServer ? "Personal access token or password" : "API token"}
            initialValue={draft.values.token}
            secureTextEntry
            disabled={draft.saving}
            onChangeText={draft.update("token")}
          />
          <SettingsAction
            label="Verify"
            hint={draft.dirty ? "Save first." : "Signs in with the saved credentials."}
            actionLabel={draft.verify.isPending ? "Checking…" : "Test connection"}
            disabled={draft.verify.isPending || draft.dirty}
            onPress={verify}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Agents">
        <SettingsCard>
          <SettingsInput
            label="Default JQL"
            hint="Runs when the search box is empty."
            initialValue={draft.values.defaultJql}
            disabled={draft.saving}
            onChangeText={draft.update("defaultJql")}
          />
          <SettingsInput
            label="Provider"
            hint="provider/model. Empty uses the first ready provider."
            initialValue={draft.values.provider}
            placeholder="claude/claude-sonnet-5"
            disabled={draft.saving}
            onChangeText={draft.update("provider")}
          />
          <SettingsInput
            label="Start prompt"
            hint="Sent before the issue when an agent starts on it."
            initialValue={draft.values.startPrompt}
            disabled={draft.saving}
            onChangeText={draft.update("startPrompt")}
          />
        </SettingsCard>
      </SettingsSection>
      {draft.dirty ? (
        <SettingsSection title="Unsaved changes">
          <SettingsCard>
            <SettingsAction
              label="Apply the edits above"
              actionLabel={draft.saving ? "Saving…" : "Save"}
              disabled={draft.saving}
              onPress={save}
            />
          </SettingsCard>
          {draft.saveError ? (
            <Text accessibilityRole="alert" style={errorStyle}>
              {draft.saveError}
            </Text>
          ) : null}
        </SettingsSection>
      ) : null}
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
  return <ConnectionRows key={settings.revision} settings={settings} theme={theme} />;
}
