import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { transformUserMacro } from "../transformUserMacro";

export function transformNewExpression(state: TransformState, node: ts.NewExpression) {
	const symbol = state.getSymbol(node.expression);

	if (symbol) {
		if (state.isUserMacro(symbol)) {
			const signature = state.typeChecker.getResolvedSignature(node);
			if (signature) {
				return transformUserMacro(state, node, signature) ?? state.transform(node);
			}
		}
	}

	return state.transform(node);
}
