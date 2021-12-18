import { Diagnostics } from "../../../../../classes/diagnostics";
import { f } from "../../../../../util/factory";
import { getNodeUid } from "../../../../../util/uid";
import { CallMacro } from "../../../macro";

export const FlameworkIdMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("id");
	},

	transform(state, node) {
		const typeArgument = node.typeArguments?.[0];
		if (!typeArgument) Diagnostics.error(node, "Expected type argument");

		return f.string(getNodeUid(state, typeArgument));
	},
};
