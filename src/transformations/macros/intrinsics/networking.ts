import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import assert from "assert";
import { f } from "../../../util/factory";
import { Diagnostics } from "../../../classes/diagnostics";
import { UserMacro } from "../../transformUserMacro";
import { getNodeUid } from "../../../util/uid";

/**
 * Obfuscates the names of events provided in networking middleware.
 *
 * This should eventually be replaced with a generic object obfuscation API.
 */
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

/**
 * Obfuscates the keys of user macro metadata using the specified context.
 *
 * This should eventually be replaced with a generic object obfuscation API.
 */
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

/**
 * Shuffles the order of an array to prevent const-matching.
 */
export function transformShuffleArrayIntrinsic(state: TransformState, macro: UserMacro) {
	if (macro.kind === "many" && Array.isArray(macro.members)) {
		macro.members = state.obfuscateArray(macro.members) as UserMacro[];
	}
}

/**
 * Gets the ID of the macro's containing statement (e.g its variable.)
 *
 * This should eventually be replaced with a field in `Modding.Caller`
 */
export function buildDeclarationUidIntrinsic(state: TransformState, node: ts.Node) {
	const parentDeclaration = ts.findAncestor(node, f.is.namedDeclaration);
	if (!parentDeclaration) {
		Diagnostics.error(node, "This function must be under a variable declaration.");
	}

	return f.string(getNodeUid(state, parentDeclaration));
}
