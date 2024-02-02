import ts from "typescript";
import path from "path";
import { TransformState } from "../../classes/transformState";
import { ClassInfo } from "../../types/classes";
import { DecoratorInfo } from "../../types/decorators";
import { f } from "../../util/factory";
import { getNodeUid, getSymbolUid } from "../../util/uid";
import { NodeMetadata } from "../../classes/nodeMetadata";

export function viewClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	const symbol = state.getSymbol(node);
	const internalId = getNodeUid(state, node);

	if (!node.name || !symbol) return;

	const nodeDecorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
	const decorators: DecoratorInfo[] = [];

	if (nodeDecorators) {
		for (const decorator of nodeDecorators) {
			if (!f.is.call(decorator.expression)) continue;

			const symbol = state.getSymbol(decorator.expression.expression);
			if (!symbol) continue;
			if (!symbol.declarations?.[0]) continue;
			if (!f.is.identifier(decorator.expression.expression)) continue;

			const name = decorator.expression.expression.text;

			decorators.push({
				type: "WithNodes",
				declaration: symbol.declarations[0],
				arguments: decorator.expression.arguments.map((x) => x),
				internalId: getSymbolUid(state, symbol, decorator.expression.expression),
				name,
				symbol,
			});
		}
	}

	if (isFlameworkClass(state, node)) {
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
				})),
			});
		}
	}
}

function isFlameworkClass(state: TransformState, declaration: ts.ClassDeclaration) {
	const metadata = new NodeMetadata(state, declaration);
	if (metadata.isRequested("reflect")) {
		return true;
	}

	const nodeDecorators = ts.canHaveDecorators(declaration) ? ts.getDecorators(declaration) : undefined;
	if (nodeDecorators && nodeDecorators.some((v) => isFlameworkDecorator(state, v))) {
		return true;
	}

	for (const member of declaration.members) {
		const nodeDecorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined;
		if (nodeDecorators && nodeDecorators.some((v) => isFlameworkDecorator(state, v))) {
			return true;
		}
	}
}

function isFlameworkDecorator(state: TransformState, decorator: ts.Decorator) {
	const decoratorType = state.typeChecker.getTypeAtLocation(decorator.expression);
	if (decoratorType.getProperty("_flamework_Decorator")) {
		return true;
	}
}
