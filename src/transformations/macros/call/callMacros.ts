import { CallMacro } from "../macro";
import { ComponentMethodMacro } from "./componentMethodMacro";
import { DependencyMacro } from "./dependencyMacro";
import { FlameworkAddPathsMacro } from "./flameworkAddPathsMacro";
import { FlameworkCreateEventMacro } from "./flameworkCreateEventMacro";
import { FlameworkCreateGuardMacro } from "./flameworkCreateGuardMacro";
import { FlameworkHashMacro } from "./flameworkHashMacro";
import { FlameworkIdMacro } from "./flameworkIdMacro";
import { FlameworkImplementsMacro } from "./flameworkImplementsMacro";
import { NetworkingConnectMacro } from "./networkingConnectMacro";

export const CALL_MACROS = new Array<CallMacro>(
	DependencyMacro,

	ComponentMethodMacro,

	NetworkingConnectMacro,

	FlameworkIdMacro,
	FlameworkAddPathsMacro,
	FlameworkCreateGuardMacro,
	FlameworkCreateEventMacro,
	FlameworkImplementsMacro,
	FlameworkHashMacro,
);
