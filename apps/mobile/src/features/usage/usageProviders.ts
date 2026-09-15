import type { UsageProviderKind } from "@t3tools/contracts";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

/**
 * Series and table order. The chart stacks providers from the bottom in this
 * order, so it also fixes which band sits on top of the bars.
 */
export const PROVIDER_ORDER: readonly UsageProviderKind[] = ["claude"];

export const PROVIDER_LABEL: Record<UsageProviderKind, string> = {
  claude: "Claude Code",
};

/**
 * Claude's brand orange holds in both themes; any other driver takes a neutral
 * that must flip with the theme or its bars vanish against the matching
 * background.
 */
export function useProviderColors(): Record<UsageProviderKind, string> & { neutral: string } {
  const { themeAppearance: scheme } = useAppearancePreferences();
  return {
    claude: "#d97757",
    neutral: scheme === "dark" ? "#e6e6e6" : "#3c3c43",
  };
}
