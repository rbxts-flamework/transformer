import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";

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
	const type = state.typeChecker.getTypeAtLocation(node);
	const networking = state.symbolProvider.getFile("@rbxts/flamework/networking").getNamespace("Networking");
	if (type.symbol !== networking.get("ServerMethod") && type.symbol !== networking.get("ClientMethod")) return;
	if (!name) Diagnostics.error(node, `Expected string`);

	return f.elementAccessExpression(node.expression, state.obfuscateText(name, "remotes"));
}

function getAccessName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
	if (f.is.propertyAccessExpression(node)) {
		return node.name.text;
	} else {
		if (f.is.string(node.argumentExpression) || f.is.identifier(node.argumentExpression)) {
			return node.argumentExpression.text;
		}
	}
}
