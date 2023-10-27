import ts from "typescript";
import { TransformState } from "../../classes/transformState";
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
	}

	return ts.visitEachChild(node, (node) => transformNode(state, node), state.context);
}
