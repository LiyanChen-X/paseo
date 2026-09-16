import { useMutation } from "@tanstack/react-query";
import { type SettingsState, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useState } from "react";
import { testConnectionRpc } from "../shared/issues";
import { connection, type ConnectionValues } from "../shared/settings";

export type ReadyConnection = Extract<SettingsState<typeof connection.schema>, { status: "ready" }>;

export const deploymentOptions = [
  { label: "Jira Cloud", value: "cloud" },
  { label: "Server / Data Center", value: "server" },
] as const;

/**
 * Draft, save, and verify logic shared by the host settings screen and the sidebar setup card.
 * Keeps the loaded revision so a save from another client conflicts instead of overwriting.
 */
export function useConnectionDraft(settings: ReadyConnection) {
  const testConnection = useRpc(testConnectionRpc);
  const [values, setValues] = useState<ConnectionValues>(settings.values);
  const [dirty, setDirty] = useState(false);
  const update = useCallback(<Key extends keyof ConnectionValues>(key: Key) => {
    return (value: ConnectionValues[Key]) => {
      setDirty(true);
      setValues((current) => ({ ...current, [key]: value }));
    };
  }, []);
  const save = useCallback(async () => {
    const saved = await settings.save(values, settings.revision);
    if (saved) setDirty(false);
    return saved;
  }, [settings, values]);
  const verify = useMutation({ mutationFn: () => testConnection({}) });
  /** Saves, then verifies the saved connection. The verification result surfaces as `verify`. */
  const connect = useMutation({
    mutationFn: async () => {
      if (!(await save()))
        throw new Error("Could not save the connection. Check the fields above.");
      return testConnection({});
    },
  });
  return {
    values,
    update,
    dirty,
    save,
    verify,
    connect,
    saving: settings.saving,
    saveError: settings.saveError,
  };
}
