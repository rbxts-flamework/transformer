import ts from "typescript";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";

export const DependencyMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flameworkFile.get("Dependency");
	},

	transform(state, node) {
		const importId = state.addFileImport(state.getSourceFile(node), "@rbxts/flamework", "Flamework");
		const argument = node.arguments[0];
		if (argument && ts.isIdentifier(argument)) {
			const symbol = state.getSymbol(argument);
			if (!symbol) return f.nil();

			const declaration = symbol.declarations?.[0];
			if (!declaration) return f.nil();

			return f.as(
				f.call(f.field(importId, "resolveDependency"), [state.getUid(declaration)]),
				f.referenceType(argument),
			);
		} else {
			const firstType = node.typeArguments?.[0];
			if (!f.is.referenceType(firstType)) return f.nil();

			const symbol = state.getSymbol(firstType.typeName);
			if (!symbol) return f.nil();

			const declaration = symbol.declarations?.[0];
			if (!declaration) return f.nil();

			return f.as(
				f.call(f.field(importId, "resolveDependency"), [f.string(state.getUid(declaration))]),
				firstType,
			);
		}
	},
};
