import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { transformExpression } from "./transformExpression";
import { transformStatement } from "./transformStatement";

export function transformNode(state: TransformState, node: ts.Node): ts.Node | ts.Statement[] {
	try {
		if (ts.isExpression(node)) {
			return transformExpression(state, node);
		} else if (ts.isStatement(node)) {
			return transformStatement(state, node);
		}
	} catch (e) {
		if (e instanceof Error && !("diagnostic" in e)) {
			Diagnostics.error(node, `Flamework failure occured here\n${e.stack}`);
		}

		throw e;
	}

	return ts.visitEachChild(node, (newNode) => transformNode(state, newNode), state.context);
}
