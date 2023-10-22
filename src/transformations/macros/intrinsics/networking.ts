import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import assert from "assert";
import { f } from "../../../util/factory";
import { Diagnostics } from "../../../classes/diagnostics";
import { UserMacro } from "../../transformUserMacro";
import { getNodeUid } from "../../../util/uid";

export function transformNetworkingMiddlewareIntrinsic(
	state: TransformState,
	signature: ts.Signature,
	args: ts.Expression[],
	parameters: ts.Symbol[],
) {
	for (const parameter of parameters) {
		const parameterIndex = signature.parameters.findIndex((v) => v.valueDeclaration?.symbol === parameter);
		const argument = args[parameterIndex];
		if (!argument || !ts.isObjectLiteralExpression(argument)) {
			continue;
		}

		const transformedElements = argument.properties.map((element) => {
			const name = element.name && ts.getPropertyNameForPropertyNameNode(element.name);
			if (name !== "middleware") {
				return element;
			}

			assert(f.is.propertyAssignmentDeclaration(element));

			const value = element.initializer;
			if (!f.is.object(value)) {
				Diagnostics.error(value, "Networking middleware must be an object.");
			}

			return f.update.propertyAssignmentDeclaration(
				element,
				f.update.object(
					value,
					state.obfuscateArray(value.properties).map((prop) => {
						if (f.is.propertyAssignmentDeclaration(prop) && "text" in prop.name) {
							return f.update.propertyAssignmentDeclaration(
								prop,
								prop.initializer,
								f.computedPropertyName(
									f.as(
										f.string(state.obfuscateText(prop.name.text, "remotes")),
										f.literalType(f.string(prop.name.text)),
									),
								),
							);
						}
						return prop;
					}),
				),
			);
		});

		args[parameterIndex] = f.object(transformedElements, true);
	}
}

export function transformObfuscatedObjectIntrinsic(state: TransformState, macro: UserMacro, hashType: ts.Type) {
	const hashContext = hashType.isStringLiteral() ? hashType.value : undefined;

	if (macro.kind === "many" && macro.members instanceof Map) {
		// Maps are order-preserving, so we can shuffle the map directly.
		for (const [key, inner] of state.obfuscateArray([...macro.members])) {
			macro.members.delete(key);
			macro.members.set(state.obfuscateText(key, hashContext), inner);
		}
	}
}

export function buildDeclarationUidIntrinsic(state: TransformState, node: ts.Node) {
	const parentDeclaration = node.parent;
	if (!f.is.namedDeclaration(parentDeclaration)) {
		Diagnostics.error(node, "This function must be under a variable declaration.");
	}

	return f.string(getNodeUid(state, parentDeclaration));
}
