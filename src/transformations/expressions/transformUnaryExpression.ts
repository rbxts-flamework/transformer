import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { getIndexExpression } from "../../util/functions/getIndexExpression";
import { isAttributesAccess } from "../../util/functions/isAttributesAccess";

const MUTATING_OPERATORS = new Map<ts.SyntaxKind, ts.BinaryOperator>([
	[ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.PlusToken],
	[ts.SyntaxKind.MinusMinusToken, ts.SyntaxKind.MinusToken],
]);

export function transformUnaryExpression(
	state: TransformState,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	const nonAssignmentOperator = MUTATING_OPERATORS.get(node.operator);
	if (nonAssignmentOperator) {
		if (isAttributesAccess(state, node.operand)) {
			const name = getIndexExpression(node.operand);
			if (!name) Diagnostics.error(node.operand, "could not get index expression");

			if (!f.is.accessExpression(node.operand.expression))
				Diagnostics.error(node.operand, "assignments not supported with direct access");

			const attributeSetter = state.addFileImport(
				node.getSourceFile(),
				"@flamework/components/out/baseComponent",
				"SYMBOL_ATTRIBUTE_SETTER",
			);
			const thisAccess = node.operand.expression.expression;
			const args = [name, f.binary(node.operand, nonAssignmentOperator, 1)];

			return f.call(f.field(thisAccess, attributeSetter, true), f.is.postfixUnary(node) ? [...args, true] : args);
		}
	}
	return state.transform(node);
}
