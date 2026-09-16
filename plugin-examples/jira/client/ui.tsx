import type { PluginHostProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo } from "react";
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";

type Theme = PluginHostProps["theme"];

/** Spacing scale. Plugins do not receive the app's spacing tokens, so the values live here. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 8, lg: 10 } as const;
export const font = { sm: 12, base: 14, lg: 16 } as const;

export interface ButtonProps {
  label: string;
  onPress(): void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  theme: Theme;
}

const BUTTON_BACKGROUND = {
  primary: (theme: Theme) => theme.colors.accent,
  secondary: (theme: Theme) => theme.colors.surface2,
  ghost: () => "transparent",
} as const;
const BUTTON_FOREGROUND = {
  primary: (theme: Theme) => theme.colors.accentForeground,
  secondary: (theme: Theme) => theme.colors.foreground,
  ghost: (theme: Theme) => theme.colors.foregroundMuted,
} as const;

/** Press feedback is scale 0.97 + opacity; disabled is opacity only, never a color change. */
export function Button({ label, onPress, variant = "secondary", disabled, theme }: ButtonProps) {
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: BUTTON_BACKGROUND[variant](theme),
      opacity: disabled ? 0.5 : 1,
      transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
    }),
    [theme, variant, disabled],
  );
  const textStyle = useMemo(
    () => ({
      fontSize: font.base,
      color: BUTTON_FOREGROUND[variant](theme),
    }),
    [theme, variant],
  );
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={style}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

export interface FieldProps {
  label: string;
  value: string;
  onChangeText(text: string): void;
  placeholder?: string;
  hint?: string;
  secureTextEntry?: boolean;
  disabled?: boolean;
  theme: Theme;
}

/** Label above a full-width input. Long values such as JQL need the whole row. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  secureTextEntry,
  disabled,
  theme,
}: FieldProps) {
  const styles = useMemo(
    () => ({
      field: { gap: space.xs },
      label: { fontSize: font.sm, fontWeight: "500" as const, color: theme.colors.foreground },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        fontSize: font.base,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        opacity: disabled ? 0.5 : 1,
      },
      hint: { fontSize: font.sm, color: theme.colors.foregroundMuted },
    }),
    [theme, disabled],
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        secureTextEntry={secureTextEntry}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export interface SegmentedProps<Value extends string> {
  value: Value;
  options: readonly { label: string; value: Value }[];
  onChange(value: Value): void;
  theme: Theme;
}

export function Segmented<Value extends string>({
  value,
  options,
  onChange,
  theme,
}: SegmentedProps<Value>) {
  const styles = useMemo(
    () => ({
      track: {
        flexDirection: "row" as const,
        padding: 2,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface2,
        gap: 2,
      },
      label: { fontSize: font.base, color: theme.colors.foregroundMuted },
      selectedLabel: { fontSize: font.base, color: theme.colors.foreground },
    }),
    [theme],
  );
  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {options.map((option) => (
        <Segment
          key={option.value}
          value={option.value}
          label={option.label}
          selected={option.value === value}
          onSelect={onChange}
          theme={theme}
          textStyle={option.value === value ? styles.selectedLabel : styles.label}
        />
      ))}
    </View>
  );
}

function Segment<Value extends string>({
  value,
  label,
  selected,
  onSelect,
  theme,
  textStyle,
}: {
  value: Value;
  label: string;
  selected: boolean;
  onSelect(value: Value): void;
  theme: Theme;
  textStyle: { fontSize: number; color: string };
}) {
  const onPress = useCallback(() => onSelect(value), [onSelect, value]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const style = useCallback(
    ({ pressed }: PressableStateCallbackType) => ({
      flex: 1,
      paddingVertical: space.xs + 2,
      borderRadius: radius.sm,
      alignItems: "center" as const,
      backgroundColor: selected ? theme.colors.surface0 : "transparent",
      opacity: pressed ? 0.8 : 1,
    }),
    [selected, theme],
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={style}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}
