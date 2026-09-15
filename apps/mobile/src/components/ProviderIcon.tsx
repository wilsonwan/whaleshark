import { Image } from "expo-image";
import { Path, Svg } from "react-native-svg";
import { View } from "react-native";
import { providerInstanceInitials } from "@t3tools/client-runtime/state/provider-instance-display";
import { useState } from "react";
import { resolveOfficialAcpRegistryIconUrl } from "@t3tools/contracts";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AppText as Text } from "./AppText";

type ProviderIconProps = {
  readonly provider: string | null | undefined;
  readonly iconUrl?: string | null | undefined;
  readonly size?: number;
};

function AcpRegistryFallbackIcon(props: { readonly color: string; readonly size: number }) {
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 576 220" fill="none">
      <Path
        fill={props.color}
        d="M568.003 115.821 517.278 27.966C507.183 10.482 489.084.023 468.894.023c-20.167 0-38.22 10.413-48.338 27.852L343.251 161.75H242.755c-6.525 0-12.369-3.365-15.62-9.004-3.274-5.639-3.274-12.369 0-18.03l50.726-87.855c3.251-5.639 9.094-9.027 15.62-9.027 6.525 0 12.346 3.365 15.62 9.027l3.024 5.229a6.81 6.81 0 0 0 5.911 3.411c2.433 0 4.707-1.319 5.912-3.433l13.437-23.555c1.41-2.479 1.137-5.571-.682-7.753C325.699 7.57 309.874 0 293.322 0c-.66 0-1.319 0-2.001.045-19.281.705-36.561 11.141-46.247 27.898l-44.859 77.714-44.405-76.509C145.465 11.209 126.594.023 106.608.023c-.659 0-1.319 0-2.001.045-19.28.705-36.56 11.141-46.246 27.898L7.658 115.821c-13.915 24.078-8.526 52.999 13.392 71.938 8.844 7.663 20.554 11.869 32.968 11.869h94.63c2.433 0 4.684-1.296 5.912-3.411l13.96-24.191a6.81 6.81 0 0 0 0-6.821c-1.228-2.115-3.479-3.411-5.912-3.411H56.042c-6.526 0-12.369-3.365-15.62-9.004-3.275-5.638-3.275-12.368 0-18.03l50.725-87.854c3.252-5.639 9.095-9.027 15.62-9.027 6.526 0 12.346 3.365 15.62 9.027l72.439 125.62c.205.364.432.682.705 1 3.229 5.139 7.299 9.959 12.255 14.256 8.845 7.662 20.554 11.869 32.968 11.869h80.67l-5.843 10.118a6.81 6.81 0 0 0 0 6.821c1.228 2.114 3.478 3.41 5.911 3.41h27.944c2.432 0 4.683-1.296 5.911-3.41l9.049-15.689 2.774-4.433.114-.205 85.99-149.334c3.251-5.639 9.095-9.027 15.62-9.027 6.526 0 12.369 3.365 15.62 9.027l50.726 87.855c3.251 5.639 3.274 12.391 0 18.03-3.252 5.639-9.095 9.027-15.62 9.027H418.669c-2.433 0-4.684 1.296-5.912 3.41l-13.983 24.192a6.81 6.81 0 0 0 0 6.821c1.228 2.114 3.479 3.41 5.912 3.41H518.21c21.6 0 41.085-11.436 50.816-29.83 9.027-17.053 8.64-37.22-1.045-54Z"
      />
    </Svg>
  );
}

function AcpRegistryProviderIcon(props: {
  readonly color: string;
  readonly iconUrl: string | null | undefined;
  readonly size: number;
}) {
  const iconUrl = resolveOfficialAcpRegistryIconUrl(props.iconUrl);
  const [image, setImage] = useState<{
    readonly iconUrl: string;
    readonly status: "loaded" | "failed";
  } | null>(null);
  const currentImage = image?.iconUrl === iconUrl ? image : null;
  const loaded = currentImage?.status === "loaded";

  return (
    <View style={{ width: props.size, height: props.size }}>
      {!loaded ? <AcpRegistryFallbackIcon color={props.color} size={props.size} /> : null}
      {iconUrl !== null && currentImage?.status !== "failed" ? (
        <Image
          accessibilityIgnoresInvertColors
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={iconUrl}
          source={{ uri: iconUrl }}
          style={{
            position: "absolute",
            width: props.size,
            height: props.size,
            opacity: loaded ? 1 : 0,
            tintColor: props.color,
          }}
          onError={() => setImage({ iconUrl, status: "failed" })}
          onLoad={() => setImage({ iconUrl, status: "loaded" })}
        />
      ) : null}
    </View>
  );
}

export function ProviderIcon(props: ProviderIconProps) {
  const { themeAppearance } = useAppearancePreferences();
  const isDarkMode = themeAppearance === "dark";
  const size = props.size ?? 16;
  const mono = isDarkMode ? "#e5e5e5" : "#171717";

  if (props.provider === "acpRegistry") {
    return <AcpRegistryProviderIcon color={mono} iconUrl={props.iconUrl} size={size} />;
  }

  if (props.provider === "pi") {
    const foreground = isDarkMode ? "#F5F5F5" : "#0F0F0F";
    return (
      <Svg width={size} height={size} viewBox="165.29 165.29 469.43 469.43" fill="none">
        <Path
          fill={foreground}
          fillRule="evenodd"
          d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
        />
        <Path fill={foreground} d="M517.36 400H634.72V634.72H517.36Z" />
      </Svg>
    );
  }

  if (props.provider === "opencode") {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 40" fill="none">
        <Path d="M24 32H8V16H24V32Z" fill={isDarkMode ? "#4B4646" : "#CFCECD"} />
        <Path d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill={isDarkMode ? "#F1ECEC" : "#211E1E"} />
      </Svg>
    );
  }

  // Drivers with no glyph of their own render nothing; callers fall back to the
  // instance initial.
  return null;
}

/**
 * `ProviderIcon` plus the web sidebar's account badge: an accent-color
 * initials bubble in the bottom-right corner, drawn when `showBadge` is set
 * (accent color present, or several instances share this driver). The glyph
 * dims to 60% opacity while the badge stays fully saturated, matching
 * `apps/web/src/components/chat/ProviderInstanceIcon.tsx`.
 */
export function ProviderInstanceIcon(props: {
  readonly iconUrl?: string | null;
  readonly provider: string | null | undefined;
  readonly size?: number;
  readonly displayName: string;
  readonly accentColor?: string;
  readonly showBadge?: boolean;
  readonly surfaceColor: string;
}) {
  return (
    <View style={{ position: "relative" }}>
      <View style={{ opacity: 0.6 }}>
        <ProviderIcon iconUrl={props.iconUrl} provider={props.provider} size={props.size} />
      </View>
      {props.showBadge ? (
        <View
          className={props.accentColor ? undefined : "bg-card"}
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            height: 12,
            minWidth: 12,
            paddingHorizontal: 2,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: props.surfaceColor,
            backgroundColor: props.accentColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            className={props.accentColor ? undefined : "text-foreground-muted"}
            style={{
              fontSize: 7,
              fontWeight: "600",
              lineHeight: 9,
              color: props.accentColor ? "#ffffff" : undefined,
            }}
          >
            {providerInstanceInitials(props.displayName)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
