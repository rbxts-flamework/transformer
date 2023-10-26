import ts from "typescript";
import { TransformState } from "../../classes/transformState";

type SymbolRecord = Record<string, GenericIdOptions>;

interface SymbolGetter {
	get(name: string): ts.Symbol;
}

export type GenericIdOptions = {
	index: number;
	optional?: boolean;
};

const COMPONENTS_SYMBOLS: SymbolRecord = {
	getComponent: { index: 1 },
	getComponents: { index: 1 },
	addComponent: { index: 1 },
	removeComponent: { index: 1 },
	getAllComponents: { index: 0 },
	waitForComponent: { index: 1 },
};

export function getGenericIdMap(state: TransformState) {
	if (state.genericIdMap) return state.genericIdMap;

	const map = new Map<ts.Symbol, GenericIdOptions>();
	const components = state.symbolProvider.components;

	if (components) addRecord(components, COMPONENTS_SYMBOLS);

	return map;

	function addRecord(symbol: SymbolGetter, record: SymbolRecord) {
		for (const [name, settings] of Object.entries(record)) {
			map.set(symbol.get(name), settings);
		}
	}
}
