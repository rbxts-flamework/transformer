import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";

/**
 * Checks if an expression is attempting to access component attributes.
 * E.g `this.attributes.myProp`
 */
export function isAttributesAccess(state: TransformState, expression: ts.Node): expression is ts.AccessExpression {
	if (!f.is.accessExpression(expression)) return false;

	const baseComponent = state.symbolProvider.componentsFile.get("BaseComponent");
	const lhs = state.getSymbol(expression.expression);

	if (
		lhs &&
		lhs.name === "attributes" &&
		state.getSourceFile(expression) !== state.symbolProvider.componentsFile.file &&
		lhs.parent === baseComponent
	) {
		return true;
	}

	return false;
}
