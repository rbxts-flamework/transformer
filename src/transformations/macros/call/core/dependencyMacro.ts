import { Diagnostics } from "../../../../classes/diagnostics";
import { f } from "../../../../util/factory";
import { getNodeUid } from "../../../../util/uid";
import { CallMacro } from "../../macro";

export const DependencyMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flameworkFile.get("Dependency");
	},

	transform(state, node) {
		if (f.is.file(node.parent.parent)) {
			Diagnostics.warning(
				node,
				"The Dependency macro should not be used outside of a function as this may introduce race conditions.",
			);
		}

		const importId = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Flamework");
		const firstArg = node.arguments[0];
		const firstType = node.typeArguments?.[0];

		if (firstArg && !firstType) {
			if (!f.is.identifier(firstArg)) Diagnostics.error(firstArg, `Expected identifier`);

			const symbol = state.getSymbol(firstArg);
			if (!symbol) Diagnostics.error(firstArg, `Could not find symbol`);

			return f.as(
				f.call(f.field(importId, "resolveDependency"), [getNodeUid(state, firstArg)]),
				f.referenceType(firstArg),
			);
		} else if (firstType && !firstArg) {
			if (!f.is.referenceType(firstType)) Diagnostics.error(node, `Expected type reference`);

			const symbol = state.getSymbol(firstType.typeName);
			if (!symbol) Diagnostics.error(firstType, `Could not find symbol`);

			const declaration = symbol.declarations?.[0];
			if (!declaration) Diagnostics.error(firstType, `Could not find declaration`);

			return f.as(
				f.call(f.field(importId, "resolveDependency"), [f.string(getNodeUid(state, declaration))]),
				firstType,
			);
		} else {
			Diagnostics.error(node, `Could not find specifier`);
		}
	},
};
