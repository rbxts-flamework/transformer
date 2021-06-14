import ts from "typescript";
import { TransformState } from "../classes/transformState";
import { catchDiagnostic } from "../util/diagnosticsUtils";
import { transformCallExpression } from "./expressions/transformCallExpression";
import { transformNode } from "./transformNode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TRANSFORMERS = new Map<ts.SyntaxKind, (state: TransformState, node: any) => ts.Expression>([
	[ts.SyntaxKind.CallExpression, transformCallExpression],
]);

export function transformExpression(state: TransformState, expression: ts.Expression): ts.Expression {
	return catchDiagnostic(expression, () => {
		const transformer = TRANSFORMERS.get(expression.kind);
		if (transformer) {
			return transformer(state, expression);
		}
		return ts.visitEachChild(expression, (newNode) => transformNode(state, newNode), state.context);
	});
}
