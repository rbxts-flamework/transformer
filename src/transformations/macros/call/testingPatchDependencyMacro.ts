import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";

export const TestingPatchDependencyMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.getNamespace("Testing").get("patchDependency");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!f.is.referenceType(firstType)) Diagnostics.error(node, `Expected type argument`);

		const declaration = state.getSymbol(firstType.typeName)?.declarations?.[0];
		if (!declaration) Diagnostics.error(firstType, `Declaration not found`);

		const uid = state.getUid(declaration);
		return f.update.call(node, node.expression, [node.arguments[0], uid]);
	},
};
