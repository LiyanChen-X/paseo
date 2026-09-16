import { useQuery } from "@tanstack/react-query";
import { type PluginSurfaceProps, usePaseo, useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { connection } from "../shared/settings";
import { IssueBrowser, useStartIssue } from "./issue-browser";
import { ConnectionForm } from "./settings";

const NO_WORKSPACES: { label: string; value: string }[] = [];

/** Sidebar surface: the same connection form as Settings → Jira plus a workspace-scoped issue browser. */
export function JiraSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const settings = useSettings(connection);
  const configured = settings.status === "ready" && settings.values.baseUrl.trim().length > 0;
  const [showConnection, setShowConnection] = useState(false);
  const toggleConnection = useCallback(() => setShowConnection((value) => !value), []);
  // Open the form once when nothing is configured yet, without fighting a manual toggle.
  useEffect(() => {
    if (settings.status === "ready" && !configured) setShowConnection(true);
  }, [settings.status, configured]);

  const workspaces = useQuery({
    queryKey: ["jira", "workspaces"],
    queryFn: () => paseo.workspaces.list(),
  });
  const options = useMemo(
    () =>
      workspaces.data?.entries.map((workspace) => ({
        label: workspace.title ?? workspace.name,
        value: workspace.id,
      })) ?? NO_WORKSPACES,
    [workspaces.data],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const workspaceId = selected ?? options[0]?.value ?? null;
  const start = useStartIssue({ workspaceId, navigation });
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
    }),
    [theme],
  );

  if (settings.status === "loading") {
    return (
      <View style={styles.screen}>
        <Text style={styles.text}>Loading Jira settings…</Text>
      </View>
    );
  }
  if (settings.status !== "ready") {
    return (
      <View style={styles.screen}>
        <Text style={styles.text}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            onPress={settings.reset}
          />
        ) : null}
      </View>
    );
  }

  return (
    <IssueBrowser theme={theme} compact={layout.compact} start={start}>
      <SettingsCard>
        <SettingsAction
          label={configured ? `Connected to ${settings.values.baseUrl}` : "Jira is not configured"}
          actionLabel={showConnection ? "Hide connection" : "Connection settings"}
          onPress={toggleConnection}
        />
        {options.length > 0 ? (
          <SettingsSelect
            label="Start agents in"
            value={workspaceId ?? ""}
            options={options}
            onValueChange={setSelected}
          />
        ) : (
          <Text style={styles.muted}>
            {workspaces.isPending ? "Loading workspaces…" : "Open a workspace to start agents."}
          </Text>
        )}
      </SettingsCard>
      {showConnection ? (
        <ConnectionForm key={settings.revision} settings={settings} theme={theme} />
      ) : null}
    </IssueBrowser>
  );
}
