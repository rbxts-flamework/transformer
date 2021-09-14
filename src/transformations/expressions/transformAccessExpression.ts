import ts from "typescript";
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
	const networking = state.symbolProvider.findFile("@flamework/networking/events/types");
	if (!networking) return;
	if (!name) return;

	const type = state.typeChecker.getTypeAtLocation(node.expression);
	if (type.getProperty("_nominal_NetworkingObfuscationMarker") === undefined) return;

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
