import ts from "typescript";
import { TransformState } from "../classes/transformState";
import { viewExpression } from "./viewExpression";
import { viewStatement } from "./viewStatement";

export function viewNode(state: TransformState, node: ts.Node) {
	if (ts.isExpression(node)) {
		viewExpression(state, node);
	} else if (ts.isStatement(node)) {
		viewStatement(state, node);
	}
}
