import { CallMacro } from "../macro";
import { DependencyMacro } from "./core/dependencyMacro";
import { FlameworkCreateGuardMacro } from "./core/flamework/createGuardMacro";
import { FlameworkHashMacro } from "./core/flamework/hashMacro";
import { FlameworkIdMacro } from "./core/flamework/flameworkIdMacro";
import { FlameworkImplementsMacro } from "./core/flamework/implementsMacro";
import { NetworkingConnectMacro } from "./networking/connectMacro";
import { GenericIdMacro } from "./core/genericIdMacro";

export const CALL_MACROS = new Array<CallMacro>(
	// @flamework/networking
	NetworkingConnectMacro,

	// @flamework/core
	GenericIdMacro,
	DependencyMacro,
	FlameworkIdMacro,
	FlameworkHashMacro,
	FlameworkImplementsMacro,
	FlameworkCreateGuardMacro,
);
