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

  if (props.provider === "claudeAgent") {
    return (
      <Svg width={size} height={size} viewBox="0 0 256 257" fill="none">
        <Path
          fill="#D97757"
          d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
        />
      </Svg>
    );
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
