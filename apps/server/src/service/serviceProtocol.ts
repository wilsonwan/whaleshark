/**
 * This fork has no release channel: the service launcher starts the server from
 * a local source checkout or build, and there is nothing to download, stage,
 * trial, or roll back. Bumping the protocol means an installed launcher must be
 * rewritten by `t3 service install` from the current checkout.
 */
export const SERVICE_LAUNCHER_PROTOCOL = 3 as const;
export const SERVICE_LAUNCHER_CONTEXT_ENV = "T3_SERVICE_LAUNCHER_CONTEXT";
export const SERVICE_LAUNCHER_FILE = "service-launcher.mjs";
export const SERVICE_STATE_FILE = "service-state.json";
/** Written by the launcher just before an explicit stop kills its child, so
    the child can tell "the service is going away" from a crash. */
export const SERVICE_STOP_MARKER_FILE = ".service-stopping";

/** The launcher's only durable document: which source entry the service runs. */
export interface ServiceState {
  readonly protocol: typeof SERVICE_LAUNCHER_PROTOCOL;
  readonly activeVersion: string;
  readonly entryPath: string;
}

/** Context is injected by the launcher when it spawns the server child. */
export interface ServiceLauncherContext {
  readonly protocol: typeof SERVICE_LAUNCHER_PROTOCOL;
  readonly childVersion: string;
}

const SEMVER_NUMBER = "(?:0|[1-9]\\d*)";
const SEMVER_PRERELEASE = `(?:${SEMVER_NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const EXACT_SERVICE_VERSION = new RegExp(
  `^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}(?:-${SEMVER_PRERELEASE}(?:\\.${SEMVER_PRERELEASE})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);

/** Accepts exact SemVer only: never dist-tags or ranges passed to npm or filesystem paths. */
export const isExactServiceVersion = (version: string): boolean =>
  EXACT_SERVICE_VERSION.test(version);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function decodeServiceState(value: unknown): ServiceState | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.protocol !== SERVICE_LAUNCHER_PROTOCOL ||
    typeof value.activeVersion !== "string" ||
    !isExactServiceVersion(value.activeVersion) ||
    typeof value.entryPath !== "string" ||
    value.entryPath.trim() === ""
  ) {
    return undefined;
  }
  return {
    protocol: SERVICE_LAUNCHER_PROTOCOL,
    activeVersion: value.activeVersion,
    entryPath: value.entryPath,
  };
}

export function parseServiceState(value: string): ServiceState | undefined {
  try {
    return decodeServiceState(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

/** Reads the active version across launcher protocol revisions for status. */
export function serviceStateActiveVersion(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) &&
      typeof parsed.activeVersion === "string" &&
      isExactServiceVersion(parsed.activeVersion)
      ? parsed.activeVersion
      : undefined;
  } catch {
    return undefined;
  }
}

export function decodeServiceLauncherContext(value: string): ServiceLauncherContext | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    parsed.protocol !== SERVICE_LAUNCHER_PROTOCOL ||
    typeof parsed.childVersion !== "string" ||
    !isExactServiceVersion(parsed.childVersion)
  ) {
    return undefined;
  }
  return { protocol: SERVICE_LAUNCHER_PROTOCOL, childVersion: parsed.childVersion };
}
