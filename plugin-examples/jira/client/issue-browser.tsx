import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type PluginHostProps,
  type PluginSurfaceProps,
  usePaseo,
  useRpc,
  useSettings,
} from "@getpaseo/plugin/client";
import { FlatList, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getIssueRpc, searchIssuesRpc } from "../shared/issues";
import { connection } from "../shared/settings";
import { startIssueAgent } from "./start-agent";

const EMPTY_ROWS: IssueRow[] = [];
const keyExtractor = (item: IssueRow) => item.id;

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  subtitle?: string;
}

/** Loads an issue and starts an agent on it in the given workspace. */
export function useStartIssue({
  workspaceId,
  navigation,
}: {
  workspaceId: string | null;
  navigation: PluginSurfaceProps["navigation"];
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const settings = useSettings(connection);
  const getIssue = useRpc(getIssueRpc);
  return useMutation({
    mutationFn: async (key: string) => {
      if (!workspaceId) throw new Error("Pick a workspace first.");
      const { issue } = await getIssue({ key });
      const values = settings.status === "ready" ? settings.values : undefined;
      return startIssueAgent({
        paseo,
        workspaceId,
        issue,
        provider: values?.provider,
        startPrompt: values?.startPrompt,
      });
    },
    onSuccess: ({ agentId }, key) => {
      toast.show(`Started an agent on ${key}`, { variant: "success" });
      navigation?.openAgent({ agentId });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export interface IssueBrowserProps {
  theme: PluginHostProps["theme"];
  compact: boolean;
  /** Rendered above the search box. */
  children?: ReactNode;
  start: ReturnType<typeof useStartIssue>;
}

export function IssueBrowser({ theme, compact, children, start }: IssueBrowserProps) {
  const search = useRpc(searchIssuesRpc);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const issues = useQuery({
    queryKey: ["jira", "issues", query],
    queryFn: () => search({ query }),
  });
  const submit = useCallback(() => setQuery(draft.trim()), [draft]);
  const styles = useBrowserStyles(theme, compact);
  const startIssue = start.mutate;
  const renderItem = useCallback(
    ({ item }: { item: IssueRow }) => (
      <IssueRowView
        item={item}
        styles={styles}
        pending={start.isPending}
        starting={start.isPending && start.variables === item.identifier}
        onStart={startIssue}
      />
    ),
    [styles, start.isPending, start.variables, startIssue],
  );

  return (
    <View style={styles.screen}>
      {children}
      <TextInput
        accessibilityLabel="Search Jira issues"
        placeholder="Issue key, JQL, or text. Empty runs your default JQL."
        placeholderTextColor={theme.colors.foregroundMuted}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {issues.isPending ? <Text style={styles.detail}>Loading issues…</Text> : null}
      {issues.error ? <Text style={styles.error}>{issues.error.message}</Text> : null}
      {issues.data && issues.data.items.length === 0 ? (
        <Text style={styles.detail}>No issues match.</Text>
      ) : null}
      <FlatList
        data={issues.data?.items ?? EMPTY_ROWS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function useBrowserStyles(theme: PluginHostProps["theme"], compact: boolean) {
  return useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: compact ? 12 : 16,
        gap: 12,
        backgroundColor: theme.colors.surface0,
      },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      rowText: { flex: 1, gap: 2 },
      key: { color: theme.colors.foregroundMuted, fontSize: 12 },
      title: { color: theme.colors.foreground },
      subtitle: { color: theme.colors.foregroundMuted, fontSize: 12 },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      buttonText: { color: theme.colors.accentForeground },
      detail: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
    }),
    [theme, compact],
  );
}

interface IssueRowViewProps {
  item: IssueRow;
  styles: ReturnType<typeof useBrowserStyles>;
  pending: boolean;
  starting: boolean;
  onStart(key: string): void;
}

function IssueRowView({ item, styles, pending, starting, onStart }: IssueRowViewProps) {
  const handleStart = useCallback(() => onStart(item.identifier), [onStart, item.identifier]);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.key}>{item.identifier}</Text>
        <Text style={styles.title}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start agent on ${item.identifier}`}
        disabled={pending}
        onPress={handleStart}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{starting ? "Starting…" : "Start agent"}</Text>
      </Pressable>
    </View>
  );
}
