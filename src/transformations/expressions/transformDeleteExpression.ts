import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { getIndexExpression } from "../../util/functions/getIndexExpression";
import { isAttributesAccess } from "../../util/functions/isAttributesAccess";

export function transformDeleteExpression(state: TransformState, node: ts.DeleteExpression) {
	if (isAttributesAccess(state, node.expression)) {
		const name = getIndexExpression(node.expression);
		if (!name) Diagnostics.error(node.expression, "could not get index expression");

		if (!f.is.accessExpression(node.expression.expression))
			Diagnostics.error(node.expression, "assignments not supported with direct access");

		const attributeSetter = state.addFileImport(
			node.getSourceFile(),
			"@flamework/components/out/baseComponent",
			"SYMBOL_ATTRIBUTE_SETTER",
		);
		const thisAccess = node.expression.expression.expression;
		return f.call(f.field(thisAccess, attributeSetter, true), [name, f.nil()]);
	}

	return node;
}
