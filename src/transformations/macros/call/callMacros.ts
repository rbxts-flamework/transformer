import { CallMacro } from "../macro";
import { DependencyMacro } from "./core/dependencyMacro";
import { GenericIdMacro } from "./core/genericIdMacro";

export const CALL_MACROS = new Array<CallMacro>(
	// @flamework/core
	GenericIdMacro,
	DependencyMacro,
);
