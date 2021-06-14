import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";

export const FlameworkHashMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("hash");
	},

	transform(state, node) {
		const firstArg = node.arguments[0];
		const secondArg = node.arguments[1];
		if (!f.is.string(firstArg)) Diagnostics.error(firstArg ?? node, "Expected string");
		if (secondArg && !f.is.string(secondArg)) Diagnostics.error(secondArg, "Expected string");

		return f.string(state.buildInfo.hashString(firstArg.text, secondArg?.text));
	},
};
