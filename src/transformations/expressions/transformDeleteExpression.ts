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

		const thisAccess = node.expression.expression.expression;
		return f.call(f.field(thisAccess, "setAttribute"), [name, f.nil()]);
	}

	return node;
}
