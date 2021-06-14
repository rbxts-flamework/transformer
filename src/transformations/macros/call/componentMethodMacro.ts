import ts from "typescript";
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
		if (f.is.referenceType(firstType)) {
			const declaration = state.getSymbol(firstType.typeName)?.declarations?.[0];
			if (declaration) {
				return f.update.call(node, undefined, [
					node.arguments[0],
					f.as(f.string(state.getUid(declaration)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
				]);
			}
		} else {
			const specifier = node.arguments[1];
			if (specifier) {
				const symbol = state.getSymbol(specifier);
				const declaration = symbol?.declarations?.[0];
				if (symbol && state.classes.has(symbol) && declaration) {
					return f.update.call(node, undefined, [
						node.arguments[0],
						f.as(f.string(state.getUid(declaration)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
					]);
				}
			}
		}
		return node;
	},
};
