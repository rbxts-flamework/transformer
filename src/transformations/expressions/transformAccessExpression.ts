import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { Diagnostics } from "../../classes/diagnostics";

export function transformAccessExpression(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
) {
	const name = getAccessName(node);
	return transformNetworkEvent(state, node, name) ?? state.transform(node);
}

function transformNetworkEvent(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	name?: string,
) {
	const type = state.typeChecker.getTypeAtLocation(node.expression);
	const hashType = state.typeChecker.getTypeOfPropertyOfType(type, "_flamework_key_obfuscation");
	if (!hashType || !hashType.isStringLiteral()) return;

	// If the access expression doesn't have a name known at compile-time, we must throw an error.
	if (name === undefined) {
		Diagnostics.error(node, "This object has key obfuscation enabled and must be accessed directly.");
	}

	return f.elementAccessExpression(
		node.expression,
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
