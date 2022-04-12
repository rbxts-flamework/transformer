import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { transformNode } from "../transformNode";
import { transformUserMacro } from "../transformUserMacro";

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	const symbol = state.getSymbol(node.expression);

	if (symbol) {
		if (state.isUserMacro(symbol)) {
			const signature = state.typeChecker.getResolvedSignature(node);
			if (signature) {
				return transformUserMacro(state, node, signature) ?? state.transform(node);
			}
		}

		const macro = state.callMacros.get(symbol);
		if (macro) {
			return macro.transform(state, node, { symbol, symbols: macro._symbols! });
		}

		const valueSymbol = f.is.namedDeclaration(symbol.valueDeclaration)
			? state.getSymbol(symbol.valueDeclaration.name)
			: undefined;

		if (valueSymbol) {
			const macro = state.callMacros.get(valueSymbol);
			if (macro) {
				return macro.transform(state, node, { symbol: valueSymbol, symbols: macro._symbols! });
			}
		}
	}

	return ts.visitEachChild(node, (node) => transformNode(state, node), state.context);
}
