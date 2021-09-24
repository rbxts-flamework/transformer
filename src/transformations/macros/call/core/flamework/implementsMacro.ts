import { Diagnostics } from "../../../../../classes/diagnostics";
import { f } from "../../../../../util/factory";
import { CallMacro } from "../../../macro";

export const FlameworkImplementsMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("implements");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!f.is.referenceType(firstType)) Diagnostics.error(firstType ?? node, `Invalid type argument`);

		const symbol = state.getSymbol(firstType.typeName);
		if (!symbol) Diagnostics.error(firstType, `Could not find symbol for type`);

		const declaration = symbol.declarations?.[0];
		if (!declaration) Diagnostics.error(firstType, `Could not find declaration for type`);

		const isImplementedId = state.addFileImport(
			state.getSourceFile(node),
			"@flamework/core/out/util/isImplemented",
			"isImplemented",
		);
		return f.call(
			isImplementedId,
			[node.arguments[0], state.getUid(declaration)],
			node.typeArguments ? [...node.typeArguments] : [],
		);
	},
};
