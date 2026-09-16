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
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";
import { getIssueRpc, searchIssuesRpc } from "../shared/issues";
import { connection } from "../shared/settings";
import { startIssueAgent } from "./start-agent";
import { font, radius, space } from "./ui";

const EMPTY_ROWS: IssueRow[] = [];
const keyExtractor = (item: IssueRow) => item.id;

export interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  subtitle?: string;
}

export interface StartIssueInput {
  key: string;
  workspaceId: string;
}

/** Loads an issue and starts an agent on it. Opens the agent when the host supports navigation. */
export function useStartIssue(navigation: PluginSurfaceProps["navigation"]) {
  const paseo = usePaseo();
  const toast = useToast();
  const settings = useSettings(connection);
  const getIssue = useRpc(getIssueRpc);
  return useMutation({
    mutationFn: async ({ key, workspaceId }: StartIssueInput) => {
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
    onSuccess: ({ agentId }, { key }) => {
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
  /** Key of the issue whose agent is starting, for the row's pending label. */
  startingKey: string | null;
  onStart(key: string): void;
}

export function IssueBrowser({
  theme,
  compact,
  children,
  startingKey,
  onStart,
}: IssueBrowserProps) {
  const search = useRpc(searchIssuesRpc);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const issues = useQuery({
    queryKey: ["jira", "issues", query],
    queryFn: () => search({ query }),
  });
  const submit = useCallback(() => setQuery(draft.trim()), [draft]);
  const styles = useBrowserStyles(theme, compact);
  const renderItem = useCallback(
    ({ item }: { item: IssueRow }) => (
      <IssueRowView
        item={item}
        styles={styles}
        starting={startingKey === item.identifier}
        disabled={startingKey !== null}
        onStart={onStart}
      />
    ),
    [styles, startingKey, onStart],
  );
  let status: string | null = null;
  if (issues.isPending) status = "Loading issues…";
  else if (issues.error) status = issues.error.message;
  else if (issues.data && issues.data.items.length === 0) status = "No matching issues";

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        {children}
        <TextInput
          accessibilityLabel="Search Jira issues"
          placeholder="Search issues, or paste an issue key or JQL"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      {status ? (
        <View style={styles.column}>
          <Text style={issues.error ? styles.error : styles.status}>{status}</Text>
        </View>
      ) : null}
      <FlatList
        data={issues.data?.items ?? EMPTY_ROWS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function useBrowserStyles(theme: PluginHostProps["theme"], compact: boolean) {
  return useMemo(() => {
    const gutter = compact ? space.lg : space.xl;
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      column: {
        width: "100%" as const,
        maxWidth: 720,
        alignSelf: "center" as const,
        paddingHorizontal: gutter,
        paddingTop: gutter,
        gap: space.lg,
      },
      list: {
        width: "100%" as const,
        maxWidth: 720,
        alignSelf: "center" as const,
        paddingHorizontal: gutter,
        paddingVertical: space.sm,
      },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        paddingVertical: space.sm + 2,
        fontSize: font.base,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
      },
      status: {
        fontSize: font.base,
        color: theme.colors.foregroundMuted,
        textAlign: "center" as const,
      },
      error: { fontSize: font.sm, color: theme.colors.statusDanger },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      rowText: { flex: 1, gap: 2 },
      key: { fontSize: font.sm, color: theme.colors.foregroundMuted },
      title: { fontSize: font.base, color: theme.colors.foreground },
      subtitle: { fontSize: font.sm, color: theme.colors.foregroundMuted },
      buttonText: { fontSize: font.base, color: theme.colors.foreground },
    };
  }, [theme, compact]);
}

interface IssueRowViewProps {
  item: IssueRow;
  styles: ReturnType<typeof useBrowserStyles>;
  starting: boolean;
  disabled: boolean;
  onStart(key: string): void;
}

function IssueRowView({ item, styles, starting, disabled, onStart }: IssueRowViewProps) {
  const handleStart = useCallback(() => onStart(item.identifier), [onStart, item.identifier]);
  const buttonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: styles.row.borderBottomColor,
      opacity: disabled && !starting ? 0.5 : 1,
      transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
    }),
    [styles, disabled, starting],
  );
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.key}>
          {item.identifier}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start agent on ${item.identifier}`}
        disabled={disabled}
        onPress={handleStart}
        style={buttonStyle}
      >
        <Text style={styles.buttonText}>{starting ? "Starting…" : "Start agent"}</Text>
      </Pressable>
    </View>
  );
}
