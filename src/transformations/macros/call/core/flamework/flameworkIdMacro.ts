import { Diagnostics } from "../../../../../classes/diagnostics";
import { f } from "../../../../../util/factory";
import { serializedTypeToString } from "../../../../../util/rtti/serializedTypeToString";
import { serializeType } from "../../../../../util/rtti/serializeType";
import { CallMacro } from "../../../macro";

export const FlameworkIdMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("id");
	},

	transform(state, node) {
		const typeArgument = node.typeArguments?.[0];
		if (!typeArgument) Diagnostics.error(node, "Expected type argument");

		const typeName = f.is.referenceType(typeArgument)
			? typeArgument.typeName
			: f.is.queryType(typeArgument)
			? typeArgument.exprName
			: Diagnostics.error(typeArgument ?? node, `Invalid type argument`);

		const typeArgumentSymbol = state.getSymbol(typeName);
		const declaration = typeArgumentSymbol?.declarations?.[0];
		if (!declaration) Diagnostics.error(typeArgument, "Could not find declaration");

		if (state.getSourceFile(node).fileName.includes("moddingTests")) {
			// console.log(JSON.stringify(serializeType(state.typeChecker.getTypeAtLocation(typeArgument)), (_, v) => v).length);
			return f.string(serializedTypeToString(serializeType(state.typeChecker.getTypeAtLocation(typeArgument))));
		}

		return f.string(state.getUid(declaration));
	},
};
