// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
// This file is shipped as a standalone bundle and copied to a stable path by
// `t3 service install`. Keep runtime imports limited to Node built-ins.
//
// This fork has no release channel, so the launcher only launches: it starts the
// source checkout or build recorded in service state, restarts nothing on its
// own, and lets systemd or launchd apply their restart policy when the child
// dies. Restarting after a source change means running `t3 service install`
// again from the checkout you want to run.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import type { ServiceLauncherContext, ServiceState } from "./service/serviceProtocol.ts";
import {
  parseServiceState,
  SERVICE_LAUNCHER_CONTEXT_ENV,
  SERVICE_LAUNCHER_PROTOCOL,
  SERVICE_STATE_FILE,
  SERVICE_STOP_MARKER_FILE,
} from "./service/serviceProtocol.ts";
import { isEntrypoint } from "./entrypoint.ts";

const TERMINATE_GRACE_MS = 5_000;

async function pathExists(target: string): Promise<boolean> {
  try {
    await NodeFSP.access(target);
    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}

export async function readServiceState(filePath: string): Promise<ServiceState> {
  const contents = await NodeFSP.readFile(filePath, "utf8");
  const state = parseServiceState(contents);
  if (state === undefined) throw new Error("Service state is invalid or unsupported.");
  return state;
}

function waitForExit(child: NodeChildProcess.ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

async function terminateChild(
  child: NodeChildProcess.ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  const force = setTimeout(() => child.kill("SIGKILL"), TERMINATE_GRACE_MS);
  try {
    await waitForExit(child);
  } finally {
    clearTimeout(force);
  }
}

const stopMarkerPath = (baseDir: string) =>
  NodePath.join(baseDir, "runtime", SERVICE_STOP_MARKER_FILE);

export class Launcher {
  readonly #baseDir: string;
  readonly #state: ServiceState;
  #child: NodeChildProcess.ChildProcess | null = null;
  #stopping = false;
  #done = false;
  readonly #completion = Promise.withResolvers<void>();

  constructor(baseDir: string, state: ServiceState) {
    this.#baseDir = baseDir;
    this.#state = state;
  }

  async run(): Promise<void> {
    const onSigterm = () => void this.stop("SIGTERM");
    const onSigint = () => void this.stop("SIGINT");
    process.once("SIGTERM", onSigterm);
    process.once("SIGINT", onSigint);
    try {
      await this.#startChild();
      await this.#completion.promise;
    } finally {
      process.off("SIGTERM", onSigterm);
      process.off("SIGINT", onSigint);
    }
  }

  async stop(signal: NodeJS.Signals): Promise<void> {
    // This must happen synchronously at signal receipt so the child can tell an
    // explicit stop from a crash while it shuts down. KillMode=mixed also
    // ensures systemd signals the launcher before the rest of the cgroup, and
    // launchd signals only the job's main process (this launcher), so the
    // marker lands before the child sees any signal on both platforms.
    try {
      NodeFS.writeFileSync(stopMarkerPath(this.#baseDir), "", { mode: 0o600 });
    } catch {
      // Err toward stopping the child; the next install or uninstall clears it.
    }
    if (this.#done) {
      await this.#completion.promise.catch(() => undefined);
      return;
    }
    this.#stopping = true;
    const child = this.#child;
    this.#child = null;
    if (child !== null) await terminateChild(child, signal);
    this.#done = true;
    this.#completion.resolve();
  }

  async #fatal(error: Error): Promise<void> {
    if (this.#done) return;
    this.#done = true;
    this.#stopping = true;
    const child = this.#child;
    this.#child = null;
    if (child !== null) await terminateChild(child);
    this.#completion.reject(error);
  }

  async #startChild(): Promise<void> {
    const { entryPath } = this.#state;
    if (!(await pathExists(entryPath))) {
      throw new Error(
        `The installed service entry '${entryPath}' is missing. Run \`t3 service install\` again from the checkout you want to run.`,
      );
    }
    if (this.#stopping) return;
    const context: ServiceLauncherContext = {
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: this.#state.activeVersion,
    };
    const child = NodeChildProcess.spawn(process.execPath, [entryPath, "serve"], {
      env: { ...process.env, [SERVICE_LAUNCHER_CONTEXT_ENV]: JSON.stringify(context) },
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      child.once("error", onError);
      child.once("spawn", () => {
        child.removeListener("error", onError);
        child.on("error", (error) => void this.#fatal(error));
        resolve();
      });
    });
    if (this.#stopping) {
      await terminateChild(child);
      return;
    }
    this.#child = child;
    child.once("exit", (code, signal) => {
      if (this.#child !== child || this.#stopping) return;
      this.#child = null;
      void this.#fatal(
        new Error(`Server child exited unexpectedly (${String(code ?? signal ?? "unknown")}).`),
      );
    });
  }
}

async function main(): Promise<void> {
  const baseDir = process.env.T3CODE_HOME?.trim();
  if (baseDir === undefined || baseDir === "") {
    throw new Error("T3CODE_HOME is required by the T3 Code service launcher.");
  }
  const statePath = NodePath.join(baseDir, "runtime", SERVICE_STATE_FILE);
  const state = await readServiceState(statePath);
  await new Launcher(baseDir, state).run();
}

if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: process.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  main().catch((cause: unknown) => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    process.stderr.write(`[service-launcher] ${error.message}\n`);
    process.exitCode = 1;
  });
}
