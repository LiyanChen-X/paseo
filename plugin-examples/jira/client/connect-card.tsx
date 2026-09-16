import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Button, Field, font, radius, Segmented, space } from "./ui";
import {
  deploymentOptions,
  type ReadyConnection,
  useConnectionDraft,
} from "./use-connection-draft";

interface ConnectCardProps {
  settings: ReadyConnection;
  theme: PluginHostProps["theme"];
  /** First-run setup shows a title; editing an existing connection shows Cancel. */
  mode: "setup" | "edit";
  onDone(): void;
}

/** Stacked connection form for the sidebar page. Save and verify happen in one action. */
export function ConnectCard({ settings, theme, mode, onDone }: ConnectCardProps) {
  const toast = useToast();
  const draft = useConnectionDraft(settings);
  const isServer = draft.values.kind === "server";
  const busy = draft.saving || draft.connect.isPending;
  const submit = useCallback(() => {
    draft.connect.mutate(undefined, {
      onSuccess: ({ displayName }) => {
        toast.show(`Connected as ${displayName}`, { variant: "success" });
        onDone();
      },
    });
  }, [draft.connect, toast, onDone]);
  const styles = useMemo(
    () => ({
      card: {
        gap: space.lg,
        padding: space.xl,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      heading: { gap: space.xs },
      title: { fontSize: font.lg, fontWeight: "500" as const, color: theme.colors.foreground },
      lead: { fontSize: font.base, color: theme.colors.foregroundMuted },
      actions: {
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
        gap: space.sm,
      },
      error: { fontSize: font.sm, color: theme.colors.statusDanger },
    }),
    [theme],
  );
  const error = draft.connect.error?.message ?? draft.saveError;

  return (
    <View style={styles.card}>
      {mode === "setup" ? (
        <View style={styles.heading}>
          <Text style={styles.title}>Connect Jira</Text>
          <Text style={styles.lead}>
            Search issues, attach them to prompts, and start agents on them.
          </Text>
        </View>
      ) : null}
      <Segmented
        value={draft.values.kind}
        options={deploymentOptions}
        onChange={draft.update("kind")}
        theme={theme}
      />
      <Field
        label="Site URL"
        value={draft.values.baseUrl}
        onChangeText={draft.update("baseUrl")}
        placeholder={isServer ? "https://jira.example.com" : "https://your-site.atlassian.net"}
        disabled={busy}
        theme={theme}
      />
      <Field
        label={isServer ? "Username" : "Email"}
        value={draft.values.email}
        onChangeText={draft.update("email")}
        placeholder={isServer ? "Optional with a personal access token" : "you@example.com"}
        disabled={busy}
        theme={theme}
      />
      <Field
        label={isServer ? "Personal access token or password" : "API token"}
        value={draft.values.token}
        onChangeText={draft.update("token")}
        hint={isServer ? undefined : "Create one at id.atlassian.com → Security → API tokens."}
        secureTextEntry
        disabled={busy}
        theme={theme}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {mode === "edit" ? (
          <Button label="Cancel" variant="ghost" onPress={onDone} disabled={busy} theme={theme} />
        ) : null}
        <Button
          label={busy ? "Connecting…" : "Connect"}
          variant="primary"
          onPress={submit}
          disabled={busy}
          theme={theme}
        />
      </View>
    </View>
  );
}
