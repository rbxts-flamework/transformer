import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { Diagnostics } from "../../classes/diagnostics";

export function transformAccessExpression(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
) {
	return transformNetworkEvent(state, node) ?? state.transform(node);
}

function transformNetworkEvent(state: TransformState, node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
	const type = state.typeChecker.getTypeAtLocation(node.expression);
	const hashType = state.typeChecker.getTypeOfPropertyOfType(type, "_flamework_key_obfuscation");
	if (!hashType || !hashType.isStringLiteral()) return;

	// If the access expression doesn't have a name known at compile-time, we must throw an error.
	const name = getAccessName(node);
	if (name === undefined) {
		// This is prevents compiler errors when we're defining obfuscated objects, or accessing them internally.
		if (f.is.elementAccessExpression(node) && f.is.asExpression(node.argumentExpression)) {
			return;
		}

		Diagnostics.error(node, "This object has key obfuscation enabled and must be accessed directly.");
	}

	return f.elementAccessExpression(
		state.transformNode(node.expression),
		f.as(f.string(state.obfuscateText(name, hashType.value)), f.literalType(f.string(name))),
		node.questionDotToken,
	);
}

function getAccessName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
	if (f.is.propertyAccessExpression(node)) {
		return node.name.text;
	} else {
		if (f.is.string(node.argumentExpression)) {
			return node.argumentExpression.text;
		}
	}
}
