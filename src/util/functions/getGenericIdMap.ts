import ts from "typescript";
import { TransformState } from "../../classes/transformState";

type SymbolRecord = Record<string, GenericIdOptions>;

interface SymbolGetter {
	get(name: string): ts.Symbol;
}

export type GenericIdOptions = {
	index: number;
	optional?: boolean;

	// These mimick the behavior of older macros but should probably be removed in the future.
	convertArgument?: boolean;
	never?: boolean;
};

const MODDING_SYMBOLS: SymbolRecord = {
	getDecorator: { index: 2 },
	getDecorators: { index: 0 },
	onListenerAdded: { index: 1, optional: true },
	onListenerRemoved: { index: 1, optional: true },
	registerDependency: { index: 1 },
	getPropertyDecorators: { index: 1 },
};

const TESTING_SYMBOLS: SymbolRecord = {
	patchDependency: { index: 1 },
};

const COMPONENTS_SYMBOLS: SymbolRecord = {
	getComponent: { index: 1, convertArgument: true, never: true },
	addComponent: { index: 1, convertArgument: true, never: true },
	removeComponent: { index: 1, convertArgument: true, never: true },
	getAllComponents: { index: 0, convertArgument: true, never: true },
};

export function getGenericIdMap(state: TransformState) {
	if (state.genericIdMap) return state.genericIdMap;

	const map = new Map<ts.Symbol, GenericIdOptions>();
	const modding = state.symbolProvider.moddingFile.getNamespace("Modding");
	const testing = state.symbolProvider.flamework.getNamespace("Testing");
	const components = state.symbolProvider.components;

	addRecord(modding, MODDING_SYMBOLS);
	addRecord(testing, TESTING_SYMBOLS);
	if (components) addRecord(components, COMPONENTS_SYMBOLS);

	return map;

	function addRecord(symbol: SymbolGetter, record: SymbolRecord) {
		for (const [name, settings] of Object.entries(record)) {
			map.set(symbol.get(name), settings);
		}
	}
}
