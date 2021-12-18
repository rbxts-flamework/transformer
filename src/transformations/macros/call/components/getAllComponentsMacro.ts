import ts from "typescript";
import { Diagnostics } from "../../../../classes/diagnostics";
import { f } from "../../../../util/factory";
import { getNodeUid, getSymbolUid } from "../../../../util/uid";
import { CallMacro } from "../../macro";

export const ComponentGetAllComponentsMacro: CallMacro = {
	getSymbol(state) {
		const symbols = state.symbolProvider;
		if (!symbols.components) return [];

		return symbols.components.get("getAllComponents");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (firstType) {
			if (!f.is.referenceType(firstType)) Diagnostics.error(firstType, `Expected type reference`);

			return f.update.call(node, state.transform(node.expression), [
				f.as(f.string(getNodeUid(state, firstType)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
			]);
		} else {
			const specifier = node.arguments[1];
			if (!specifier) Diagnostics.error(node, `No specifier found`);

			const symbol = state.getSymbol(specifier);
			if (!symbol) Diagnostics.error(specifier, `Symbol could not be found`);
			if (!state.classes.has(symbol)) return state.transform(node);

			return f.update.call(node, state.transform(node.expression), [
				f.as(f.string(getSymbolUid(state, symbol, specifier)), f.keywordType(ts.SyntaxKind.NeverKeyword)),
			]);
		}
	},
};
