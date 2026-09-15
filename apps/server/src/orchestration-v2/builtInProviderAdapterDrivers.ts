import type { ProviderDriverKind } from "@t3tools/contracts";

import {
  AcpRegistryAdapterV2Driver,
  type AcpRegistryAdapterV2DriverEnv,
} from "./Adapters/AcpRegistryAdapterV2.ts";

import {
  OpenCodeAdapterV2Driver,
  type OpenCodeAdapterV2DriverEnv,
} from "./Adapters/OpenCodeAdapterV2.ts";
import { PiAdapterV2Driver, type PiAdapterV2DriverEnv } from "./Adapters/PiAdapterV2.ts";
import type { AnyProviderAdapterDriver } from "./ProviderAdapterDriver.ts";

export type BuiltInProviderAdapterDriversV2Env =
  | AcpRegistryAdapterV2DriverEnv
  | OpenCodeAdapterV2DriverEnv
  | PiAdapterV2DriverEnv;

const BUILT_IN_PROVIDER_ADAPTER_DRIVERS_V2: ReadonlyArray<
  AnyProviderAdapterDriver<BuiltInProviderAdapterDriversV2Env>
> = [OpenCodeAdapterV2Driver, PiAdapterV2Driver, AcpRegistryAdapterV2Driver];

export const BUILT_IN_PROVIDER_ADAPTER_DRIVER_KINDS_V2: ReadonlySet<ProviderDriverKind> = new Set(
  BUILT_IN_PROVIDER_ADAPTER_DRIVERS_V2.map((driver) => driver.driverKind),
);

export const isBuiltInProviderAdapterDriverV2 = (driver: ProviderDriverKind): boolean =>
  BUILT_IN_PROVIDER_ADAPTER_DRIVER_KINDS_V2.has(driver);
