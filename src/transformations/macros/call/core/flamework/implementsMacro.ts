import { Diagnostics } from "../../../../../classes/diagnostics";
import { f } from "../../../../../util/factory";
import { getNodeUid } from "../../../../../util/uid";
import { CallMacro } from "../../../macro";

export const FlameworkImplementsMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("implements");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!f.is.referenceType(firstType)) Diagnostics.error(firstType ?? node, `Invalid type argument`);

		const importId = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Flamework");
		return f.call(
			f.field(importId, "_implements"),
			[node.arguments[0], getNodeUid(state, firstType)],
			node.typeArguments ? [...node.typeArguments] : [],
		);
	},
};
