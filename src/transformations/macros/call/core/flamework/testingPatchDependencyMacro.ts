import { Diagnostics } from "../../../../../classes/diagnostics";
import { f } from "../../../../../util/factory";
import { getNodeUid } from "../../../../../util/uid";
import { CallMacro } from "../../../macro";

export const TestingPatchDependencyMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.getNamespace("Testing").get("patchDependency");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!f.is.referenceType(firstType)) Diagnostics.error(node, `Expected type argument`);

		const uid = getNodeUid(state, firstType);
		return f.update.call(node, node.expression, [node.arguments[0], uid]);
	},
};
