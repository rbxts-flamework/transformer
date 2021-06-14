import ts from "typescript";
import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";

export const ComponentMethodMacro: CallMacro = {
	getSymbol(state) {
		const symbols = state.symbolProvider;
		return [
			symbols.components.get("addComponent"),
			symbols.components.get("removeComponent"),
			symbols.components.get("getComponent"),
		];
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (firstType) {
			if (!f.is.referenceType(firstType)) Diagnostics.error(firstType, `Expected type reference`);

			const declaration = state.getSymbol(firstType.typeName)?.declarations?.[0];
			if (!declaration) Diagnostics.error(firstType, `Could not find declaration`);

			return f.update.call(node, undefined, [
				node.arguments[0],
				f.as(f.string(state.getUid(declaration)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
			]);
		} else {
			const specifier = node.arguments[1];
			if (!specifier) Diagnostics.error(node, `No specifier found`);

			const symbol = state.getSymbol(specifier);
			if (!symbol) Diagnostics.error(specifier, `Symbol could not be found`);

			const declaration = symbol?.declarations?.[0];
			if (!declaration) Diagnostics.error(specifier, `Declaration could not be found`);

			return f.update.call(node, undefined, [
				node.arguments[0],
				f.as(f.string(state.getUid(declaration)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
			]);
		}
	},
};
