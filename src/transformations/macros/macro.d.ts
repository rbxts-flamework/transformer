import ts from "typescript";
import { TransformState } from "../../classes/transformState";

interface MacroInfo {
	symbol: ts.Symbol;
	symbols: ts.Symbol[];
}

interface Macro {
	_symbols?: ts.Symbol[];
	getSymbol(state: TransformState): ts.Symbol | ts.Symbol[];
	transform(state: TransformState, node: ts.Node, macro: MacroInfo): ts.Node | ts.Node[] | undefined;
}

export interface CallMacro extends Macro {
	transform(state: TransformState, node: ts.CallExpression, macro: MacroInfo): ts.Expression;
}
