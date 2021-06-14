import ts from "typescript";
import { TransformState } from "../classes/transformState";
import { transformExpression } from "./transformExpression";
import { transformStatement } from "./transformStatement";

export function transformNode(state: TransformState, node: ts.Node): ts.Node | ts.Statement[] {
	if (ts.isExpression(node)) {
		return transformExpression(state, node);
	} else if (ts.isStatement(node)) {
		return transformStatement(state, node);
	}

	return ts.visitEachChild(node, (newNode) => transformNode(state, newNode), state.context);
}
