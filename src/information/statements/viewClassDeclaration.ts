import ts from "typescript";
import path from "path";
import { TransformState } from "../../classes/transformState";
import { ClassInfo } from "../../types/classes";
import { DecoratorInfo } from "../../types/decorators";
import { f } from "../../util/factory";
import { getNodeUid, getSymbolUid } from "../../util/uid";

export function viewClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	const { symbolProvider } = state;

	const symbol = state.getSymbol(node);
	const internalId = getNodeUid(state, node);

	if (!node.name || !symbol) return;

	const decorators: DecoratorInfo[] = [];
	const flameworkDecorators = new Set([
		symbolProvider.flameworkFile.get("Service"),
		symbolProvider.flameworkFile.get("Controller"),
		symbolProvider.componentsFile?.get("Component"),
	]);

	if (node.decorators) {
		for (const decorator of node.decorators) {
			if (!f.is.call(decorator.expression)) continue;

			const symbol = state.getSymbol(decorator.expression.expression);
			if (!symbol) continue;
			if (!symbol.declarations?.[0]) continue;
			if (!f.is.identifier(decorator.expression.expression)) continue;

			const name = decorator.expression.expression.text;
			const isFlameworkDecorator = flameworkDecorators.has(symbol);

			decorators.push({
				type: "WithNodes",
				declaration: symbol.declarations[0],
				arguments: decorator.expression.arguments.map((x) => x),
				internalId: getSymbolUid(state, symbol, decorator.expression.expression),
				isFlameworkDecorator,
				name,
				symbol,
			});
		}
	}
	if (decorators.length > 0) {
		const classInfo: ClassInfo = {
			name: node.name.text,
			internalId,
			node,
			decorators,
			symbol,
		};

		state.classes.set(symbol, classInfo);

		if (!state.isGame && !state.buildInfo.getBuildClass(internalId)) {
			const filePath = state.pathTranslator.getOutputPath(state.getSourceFile(node).fileName);
			const relativePath = path.relative(state.currentDirectory, filePath);
			state.buildInfo.addBuildClass({
				filePath: relativePath,
				internalId,
				decorators: decorators.map((x) => ({
					internalId: x.internalId,
					isFlameworkDecorator: x.isFlameworkDecorator,
					name: x.name,
				})),
			});
		}
	} else {
		const buildClass = state.buildInfo.getBuildClass(internalId);
		if (buildClass) {
			state.classes.set(symbol, {
				internalId,
				node,
				symbol,
				name: node.name.text,
				decorators: buildClass.decorators.map((x) => ({
					type: "Base",
					internalId: x.internalId,
					name: x.name,
					isFlameworkDecorator: x.isFlameworkDecorator,
				})),
			});
		}
	}
}
