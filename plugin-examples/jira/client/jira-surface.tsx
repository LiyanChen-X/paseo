import { useQuery } from "@tanstack/react-query";
import { type PluginSurfaceProps, usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";
import { testConnectionRpc } from "../shared/issues";
import { connection } from "../shared/settings";
import { ConnectCard } from "./connect-card";
import { IssueBrowser, useStartIssue } from "./issue-browser";
import { Button, font, radius, space } from "./ui";
import type { ReadyConnection } from "./use-connection-draft";

/**
 * Sidebar page. Unconfigured: a single setup card. Configured: connection line, search, and
 * issues. The workspace is chosen at the moment of intent, when Start agent is pressed.
 */
export function JiraSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const settings = useSettings(connection);
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      centered: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
        justifyContent: "center" as const,
        paddingHorizontal: layout.compact ? space.lg : space.xl,
        paddingVertical: space.xl,
      },
      column: { width: "100%" as const, maxWidth: 480, alignSelf: "center" as const },
      problemColumn: {
        width: "100%" as const,
        maxWidth: 480,
        alignSelf: "center" as const,
        alignItems: "center" as const,
        gap: space.lg,
      },
      text: { fontSize: font.base, color: theme.colors.foreground, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );
  const noop = useCallback(() => {}, []);

  if (settings.status === "loading") return <View style={styles.screen} />;
  if (settings.status !== "ready") {
    return (
      <View style={styles.centered}>
        <View style={styles.problemColumn}>
          <Text style={styles.text}>{settings.error}</Text>
          <Button label="Reload" onPress={settings.reload} theme={theme} />
          {settings.status === "invalid" ? (
            <Button label="Reset settings" variant="ghost" onPress={settings.reset} theme={theme} />
          ) : null}
        </View>
      </View>
    );
  }
  if (!settings.values.baseUrl.trim()) {
    return (
      <View style={styles.centered}>
        <View style={styles.column}>
          <ConnectCard settings={settings} theme={theme} mode="setup" onDone={noop} />
        </View>
      </View>
    );
  }
  return (
    <ConnectedSurface
      key={settings.revision}
      settings={settings}
      theme={theme}
      compact={layout.compact}
      navigation={navigation}
    />
  );
}

interface ConnectedSurfaceProps {
  settings: ReadyConnection;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  navigation: PluginSurfaceProps["navigation"];
}

function ConnectedSurface({ settings, theme, compact, navigation }: ConnectedSurfaceProps) {
  const paseo = usePaseo();
  const testConnection = useRpc(testConnectionRpc);
  const [editing, setEditing] = useState(false);
  const openEditor = useCallback(() => setEditing(true), []);
  const closeEditor = useCallback(() => setEditing(false), []);
  const identity = useQuery({
    queryKey: ["jira", "identity", settings.revision],
    queryFn: () => testConnection({}),
    retry: false,
  });
  const workspaces = useQuery({
    queryKey: ["jira", "workspaces"],
    queryFn: () => paseo.workspaces.list(),
  });
  const start = useStartIssue(navigation);
  const startMutate = start.mutate;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const closePicker = useCallback((open: boolean) => {
    if (!open) setPendingKey(null);
  }, []);
  const onStart = useCallback(
    (key: string) => {
      const entries = workspaces.data?.entries ?? [];
      if (entries.length === 1) {
        startMutate({ key, workspaceId: entries[0].id });
        return;
      }
      setPendingKey(key);
    },
    [workspaces.data, startMutate],
  );
  const pickWorkspace = useCallback(
    (workspaceId: string) => {
      if (pendingKey) startMutate({ key: pendingKey, workspaceId });
      setPendingKey(null);
    },
    [pendingKey, startMutate],
  );
  const host = settings.values.baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const styles = useMemo(
    () => ({
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.md },
      identity: { flex: 1, gap: 2 },
      host: { fontSize: font.base, color: theme.colors.foreground },
      who: { fontSize: font.sm, color: theme.colors.foregroundMuted },
      problem: { fontSize: font.sm, color: theme.colors.statusDanger },
    }),
    [theme],
  );
  let who: string | null = null;
  if (identity.isPending) who = "Checking connection…";
  else if (identity.data) who = `Signed in as ${identity.data.displayName}`;

  return (
    <>
      <IssueBrowser
        theme={theme}
        compact={compact}
        startingKey={start.isPending ? (start.variables?.key ?? null) : null}
        onStart={onStart}
      >
        {editing ? (
          <ConnectCard settings={settings} theme={theme} mode="edit" onDone={closeEditor} />
        ) : (
          <View style={styles.header}>
            <View style={styles.identity}>
              <Text style={styles.host}>{host}</Text>
              {who ? <Text style={styles.who}>{who}</Text> : null}
              {identity.error ? <Text style={styles.problem}>{identity.error.message}</Text> : null}
            </View>
            <Button label="Edit connection" variant="ghost" onPress={openEditor} theme={theme} />
          </View>
        )}
      </IssueBrowser>
      <Modal
        title={pendingKey ? `Start ${pendingKey} in…` : "Choose a workspace"}
        open={pendingKey !== null}
        onOpenChange={closePicker}
      >
        <Modal.Content>
          {(workspaces.data?.entries ?? []).length === 0 ? (
            <Text style={styles.who}>Open a workspace first.</Text>
          ) : null}
          {(workspaces.data?.entries ?? []).map((workspace) => (
            <WorkspaceOption
              key={workspace.id}
              id={workspace.id}
              name={workspace.title ?? workspace.name}
              project={workspace.projectDisplayName}
              theme={theme}
              onPick={pickWorkspace}
            />
          ))}
        </Modal.Content>
      </Modal>
    </>
  );
}

function WorkspaceOption({
  id,
  name,
  project,
  theme,
  onPick,
}: {
  id: string;
  name: string;
  project: string;
  theme: PluginSurfaceProps["theme"];
  onPick(id: string): void;
}) {
  const press = useCallback(() => onPick(id), [onPick, id]);
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      paddingVertical: space.md,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: pressed ? theme.colors.surface2 : "transparent",
      gap: 2,
    }),
    [theme],
  );
  const styles = useMemo(
    () => ({
      name: { fontSize: font.base, color: theme.colors.foreground },
      project: { fontSize: font.sm, color: theme.colors.foregroundMuted },
    }),
    [theme],
  );
  return (
    <Pressable accessibilityRole="button" onPress={press} style={style}>
      <Text style={styles.name}>{name}</Text>
      {project !== name ? <Text style={styles.project}>{project}</Text> : null}
    </Pressable>
  );
}
