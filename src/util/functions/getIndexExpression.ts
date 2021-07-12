import ts from "typescript";
import { f } from "../factory";

/**
 * Gets the expression used to index the AccessExpression.
 * Converts properties to strings.
 */
export function getIndexExpression(expression: ts.AccessExpression) {
	if (f.is.propertyAccessExpression(expression)) {
		return f.string(expression.name.text);
	} else {
		return expression.argumentExpression;
	}
}
