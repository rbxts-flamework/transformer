import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";
import { NodeMetadata } from "../../classes/nodeMetadata";

/**
 * Checks if an expression is attempting to access component attributes.
 * E.g `this.attributes.myProp`
 */
export function isAttributesAccess(state: TransformState, expression: ts.Node): expression is ts.AccessExpression {
	if (!f.is.accessExpression(expression)) {
		return false;
	}

	const lhs = state.getSymbol(expression.expression);
	if (!lhs) {
		return false;
	}

	const metadata = NodeMetadata.fromSymbol(state, lhs);
	if (!metadata) {
		return false;
	}

	return metadata.isRequested("intrinsic-component-attributes");
}
