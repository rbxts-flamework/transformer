import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";

export const FlameworkIdMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("id");
	},

	transform(state, node) {
		const typeArgument = node.typeArguments?.[0];
		if (!f.is.referenceType(typeArgument)) Diagnostics.error(typeArgument ?? node, `Invalid type argument`);

		const typeArgumentSymbol = state.getSymbol(typeArgument.typeName);
		const declaration = typeArgumentSymbol?.declarations?.[0];
		if (!declaration) Diagnostics.error(typeArgument, "Could not find declaration");

		return f.string(state.getUid(declaration));
	},
};
