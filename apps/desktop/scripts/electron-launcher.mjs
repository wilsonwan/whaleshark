// This file mostly exists because we want dev mode to say "T3 Code (Dev)" instead of "electron"

import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const desktopDir = NodePath.resolve(__dirname, "..");
const devBundleIdSuffix = NodePath.basename(NodePath.resolve(desktopDir, "..", ".."))
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "");
const APP_BUNDLE_ID = isDevelopment
  ? `com.t3tools.t3code.dev.${devBundleIdSuffix || "local"}`
  : "com.t3tools.t3code";
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone launcher script has no Effect runtime.
const hostPlatform = NodeOS.platform();

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function makeDevelopmentEnvironmentScript(environment) {
  const envEntries = [
    ["VITE_DEV_SERVER_URL", environment.VITE_DEV_SERVER_URL],
    ["T3CODE_PORT", environment.T3CODE_PORT],
    ["T3CODE_HOME", environment.T3CODE_HOME],
    ["T3CODE_COMMIT_HASH", environment.T3CODE_COMMIT_HASH],
    ["T3CODE_OTLP_TRACES_URL", environment.T3CODE_OTLP_TRACES_URL],
    ["T3CODE_OTLP_EXPORT_INTERVAL_MS", environment.T3CODE_OTLP_EXPORT_INTERVAL_MS],
    ["T3CODE_DESKTOP_APP_USER_MODEL_ID", APP_BUNDLE_ID],
  ].filter((entry) => typeof entry[1] === "string" && entry[1].trim().length > 0);
  return [
    ...envEntries.map(
      ([name, value]) =>
        `if [ -z "\${${name}:-}" ]; then export ${name}=${shellSingleQuote(value)}; fi`,
    ),
    "",
  ].join("\n");
}

export function makeDevelopmentLauncherScript({
  electronBinaryPath,
  mainEntryPath,
  desktopRoot,
  environmentFilePath,
}) {
  return [
    "#!/bin/sh",
    `if [ -f ${shellSingleQuote(environmentFilePath)} ]; then . ${shellSingleQuote(environmentFilePath)}; fi`,
    `exec ${shellSingleQuote(electronBinaryPath)} --t3code-dev-root=${shellSingleQuote(desktopRoot)} ${shellSingleQuote(mainEntryPath)} "$@"`,
    "",
  ].join("\n");
}

const developmentEnvironmentFilePath = NodePath.join(
  desktopDir,
  ".electron-runtime",
  "dev-environment.sh",
);

function writeDevelopmentEnvironmentScript() {
  NodeFS.mkdirSync(NodePath.dirname(developmentEnvironmentFilePath), { recursive: true });
  NodeFS.writeFileSync(
    developmentEnvironmentFilePath,
    makeDevelopmentEnvironmentScript(process.env),
  );
}

export function writeDevelopmentLauncherScript(targetBinaryPath, electronBinaryPath) {
  const script = makeDevelopmentLauncherScript({
    electronBinaryPath,
    mainEntryPath: NodePath.join(desktopDir, "dist-electron", "main.cjs"),
    desktopRoot: desktopDir,
    environmentFilePath: developmentEnvironmentFilePath,
  });
  if (
    NodeFS.existsSync(targetBinaryPath) &&
    NodeFS.readFileSync(targetBinaryPath, "utf8") === script
  ) {
    NodeFS.chmodSync(targetBinaryPath, 0o755);
    return false;
  }
  NodeFS.writeFileSync(targetBinaryPath, script);
  NodeFS.chmodSync(targetBinaryPath, 0o755);
  return true;
}

function isLinuxSetuidSandboxConfigured(electronBinaryPath) {
  if (hostPlatform !== "linux") {
    return true;
  }

  const sandboxPath = NodePath.join(NodePath.dirname(electronBinaryPath), "chrome-sandbox");
  try {
    const sandboxStat = NodeFS.statSync(sandboxPath);
    return sandboxStat.uid === 0 && (sandboxStat.mode & 0o4777) === 0o4755;
  } catch {
    return false;
  }
}

function resolveLinuxSandboxArgs(electronBinaryPath) {
  if (isLinuxSetuidSandboxConfigured(electronBinaryPath)) {
    return [];
  }

  console.warn(
    "[desktop-launcher] Electron chrome-sandbox is not root-owned with mode 4755; launching local Electron with --no-sandbox.",
  );
  return ["--no-sandbox"];
}

function resolveElectronPath() {
  return resolveElectronBinaryPath();
}

export function resolveElectronLaunchCommand(args = []) {
  const electronPath = resolveElectronPath();
  return {
    electronPath,
    args: [...resolveLinuxSandboxArgs(electronPath), ...args],
  };
}

export function resolveElectronBinaryPath({
  ensureRuntime = ensureElectronRuntime,
  createRequire = NodeModule.createRequire,
  moduleUrl = import.meta.url,
} = {}) {
  ensureRuntime();

  const require = createRequire(moduleUrl);
  return require("electron");
}

export function resolveDevProtocolClient() {
  return null;
}
