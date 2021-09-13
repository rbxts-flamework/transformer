import { CallMacro } from "../macro";
import { ComponentGetAllComponentsMacro } from "./components/getAllComponentsMacro";
import { ComponentMethodMacro } from "./components/methodMacro";
import { DependencyMacro } from "./core/dependencyMacro";
import { FlameworkAddPathsMacro } from "./core/flamework/addPathsMacro";
import { NetworkingCreateEventMacro } from "./networking/createEventMacro";
import { FlameworkCreateGuardMacro } from "./core/flamework/createGuardMacro";
import { FlameworkHashMacro } from "./core/flamework/hashMacro";
import { FlameworkIdMacro } from "./core/flamework/flameworkIdMacro";
import { FlameworkImplementsMacro } from "./core/flamework/implementsMacro";
import { NetworkingConnectMacro } from "./networking/connectMacro";
import { TestingPatchDependencyMacro } from "./core/flamework/testingPatchDependencyMacro";

export const CALL_MACROS = new Array<CallMacro>(
	// @flamework/components
	ComponentMethodMacro,
	ComponentGetAllComponentsMacro,

	// @flamework/networking
	NetworkingConnectMacro,
	NetworkingCreateEventMacro,

	// @flamework/core
	DependencyMacro,
	FlameworkIdMacro,
	FlameworkHashMacro,
	FlameworkAddPathsMacro,
	FlameworkImplementsMacro,
	FlameworkCreateGuardMacro,
	TestingPatchDependencyMacro,
);
