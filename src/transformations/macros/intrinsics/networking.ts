import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import assert from "assert";
import { f } from "../../../util/factory";
import { Diagnostics } from "../../../classes/diagnostics";

export function buildNetworkingMiddlewareIntrinsic(
	state: TransformState,
	signature: ts.Signature,
	args: ts.Expression[],
	parameters: ts.Symbol[],
) {
	console.log("networking middleware", parameters.length);
	for (const parameter of parameters) {
		const parameterIndex = signature.parameters.findIndex((v) => v.valueDeclaration?.symbol === parameter);
		const argument = args[parameterIndex];
		if (!argument || !ts.isObjectLiteralExpression(argument)) {
			console.log("no arg for", parameterIndex);
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
								f.string(state.obfuscateText(prop.name.text, "remotes")),
							);
						}
						return prop;
					}),
				),
			);
		});

		args[parameterIndex] = f.object(transformedElements, true);
		console.log("setting", parameterIndex, "to new arg");
	}
}
