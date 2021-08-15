import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";

export function getPrettyName(state: TransformState, node: ts.Node | undefined, fallback: string, prefix = "_") {
	if (!node) return `${prefix}${fallback}`;

	return `${prefix}${getPrettyNameInner(state, node, fallback)}`;
}

function getPrettyNameInner(state: TransformState, node: ts.Node, fallback: string) {
	if (f.is.referenceType(node)) {
		const symbol = state.getSymbol(node.typeName);
		if (symbol) {
			return camelCase(symbol.name);
		}
	} else if (f.is.identifier(node)) {
		return camelCase(node.text);
	}

	return fallback;
}

function camelCase(name: string) {
	return name.substr(0, 1).toLowerCase() + name.substr(1);
}
