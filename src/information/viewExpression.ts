import ts from "typescript";
import { TransformState } from "../classes/transformState";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VIEWERS = new Map<ts.SyntaxKind, (state: TransformState, node: any) => void>([
	// [ts.SyntaxKind.IfStatement, transformIfStatement],
]);

export function viewExpression(state: TransformState, expression: ts.Expression) {
	// do stuff
	const viewer = VIEWERS.get(expression.kind);
	if (viewer) {
		viewer(state, expression);
	}
}
