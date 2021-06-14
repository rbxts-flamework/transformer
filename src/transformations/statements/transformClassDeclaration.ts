import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { DecoratorInfo, DecoratorWithNodes } from "../../types/decorators";
import { f } from "../../util/factory";
import { buildGuardsFromType } from "../../util/functions/buildGuardFromType";
import { getSuperClasses } from "../../util/functions/getSuperClasses";
import { transformNode } from "../transformNode";

export function transformClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	const symbol = state.getSymbol(node);
	if (!symbol || !node.name) return node;

	const classInfo = state.classes.get(symbol);
	if (!classInfo) return node;

	const fields: ts.ObjectLiteralElementLike[] = [];

	fields.push(f.propertyDeclaration("identifier", state.getUid(node)));
	fields.push(f.propertyDeclaration("isExternal", classInfo.isExternal));

	fields.push(
		f.propertyDeclaration(
			"decorators",
			classInfo.decorators
				.filter((x): x is DecoratorWithNodes => x.type === "WithNodes")
				.map((x) => {
					const id = state.getUid(x.declaration);

					let config: ts.Expression;
					if (x.isFlameworkDecorator) {
						const baseObject = f.is.object(x.arguments[0]) ? x.arguments[0] : f.object([]);
						config = generateFlameworkConfig(state, node, x, baseObject);
					} else {
						config = f.object({
							type: "Arbitrary",
							arguments: x.arguments,
						});
					}

					return f.object([f.propertyDeclaration("identifier", id), f.propertyDeclaration("config", config)]);
				}),
		),
	);

	const constructor = node.members.find((x): x is ts.ConstructorDeclaration => f.is.constructor(x));
	if (constructor) {
		const constructorDependencies = [];
		for (const param of constructor.parameters) {
			if (f.is.referenceType(param.type)) {
				const symbol = state.getSymbol(param.type.typeName);
				const declaration = symbol?.getDeclarations()?.[0];
				if (declaration) {
					constructorDependencies.push(state.getUid(declaration));
					continue;
				}
			}
			console.log(node.getText());
			throw new Error("Argument cannot be injected");
		}
		if (constructor.parameters.length > 0) {
			fields.push(f.propertyDeclaration("dependencies", constructorDependencies));
		}
	}

	if (node.heritageClauses) {
		const implementClauses = new Array<ts.StringLiteral>();
		for (const clause of node.heritageClauses) {
			if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
				for (const type of clause.types) {
					if (ts.isIdentifier(type.expression)) {
						const symbol = state.getSymbol(type.expression);
						const declaration = symbol?.declarations?.[0];
						if (declaration) implementClauses.push(f.string(state.getUid(declaration)));
					}
				}
			}
		}
		if (implementClauses.length > 0) {
			fields.push(f.propertyDeclaration("implements", f.array(implementClauses, false)));
		}
	}

	const importIdentifier = state.addFileImport(state.getSourceFile(node), "@rbxts/flamework", "Flamework");
	return [
		ts.visitEachChild(
			f.update.classDeclaration(node, node.name, node.members, undefined),
			(node) => transformNode(state, node),
			state.context,
		),
		f.statement(f.call(f.field(importIdentifier, "registerMetadata"), [node.name, f.object(fields)])),
	];
}

function calculateOmittedGuards(
	state: TransformState,
	classDeclaration: ts.ClassDeclaration,
	customAttributes?: ts.ObjectLiteralElementLike,
) {
	const omittedNames = new Set<string>();
	if (f.is.propertyAssignmentDeclaration(customAttributes) && f.is.object(customAttributes.initializer)) {
		for (const prop of customAttributes.initializer.properties) {
			if (f.is.string(prop.name) || f.is.identifier(prop.name)) {
				omittedNames.add(prop.name.text);
			}
		}
	}

	const type = state.typeChecker.getTypeAtLocation(classDeclaration);
	const property = type.getProperty("attributes");
	if (!property) return omittedNames;

	const superClass = getSuperClasses(state.typeChecker, classDeclaration)[0];
	if (!superClass) return omittedNames;

	const superType = state.typeChecker.getTypeAtLocation(superClass);
	const superProperty = superType.getProperty("attributes");
	if (!superProperty) return omittedNames;

	const attributes = state.typeChecker.getTypeOfSymbolAtLocation(property, classDeclaration);
	const superAttributes = state.typeChecker.getTypeOfSymbolAtLocation(superProperty, superClass);
	for (const { name } of superAttributes.getProperties()) {
		const prop = state.typeChecker.getTypeOfPropertyOfType(attributes, name);
		const superProp = state.typeChecker.getTypeOfPropertyOfType(superAttributes, name);

		if (prop && superProp && superProp === prop) {
			omittedNames.add(name);
		}
	}

	return omittedNames;
}

function generateComponentConfig(
	state: TransformState,
	node: ts.ClassDeclaration,
	properties: ts.ObjectLiteralElementLike[],
): ts.ObjectLiteralElementLike[] | undefined {
	const type = state.typeChecker.getTypeAtLocation(node);
	const property = type.getProperty("attributes");
	if (!property || property.parent !== state.symbolProvider.componentsFile.get("BaseComponent")) return;

	const attributesType = state.typeChecker.getTypeOfSymbolAtLocation(property, node);
	if (!attributesType) return;

	const attributes = properties.find((x) => x.name && "text" in x.name && x.name.text === "attributes");
	const attributeGuards = buildGuardsFromType(state, state.getSourceFile(node), attributesType);

	const omittedGuards = calculateOmittedGuards(state, node, attributes);
	const filteredGuards = attributeGuards.filter((x) => !omittedGuards.has((x.name as ts.StringLiteral).text));
	properties = properties.filter((x) => x !== attributes);

	if (f.is.propertyAssignmentDeclaration(attributes) && f.is.object(attributes.initializer)) {
		properties.push(
			f.update.propertyAssignmentDeclaration(
				attributes,
				f.update.object(attributes.initializer, [...attributes.initializer.properties, ...filteredGuards]),
				attributes.name,
			),
		);
	} else {
		properties.push(f.propertyDeclaration("attributes", f.object(filteredGuards)));
	}

	return properties;
}

function generateFlameworkConfig(
	state: TransformState,
	node: ts.ClassDeclaration,
	decorator: DecoratorInfo,
	config: ts.ObjectLiteralExpression,
) {
	let properties: ts.ObjectLiteralElementLike[] = [...config.properties];

	// Automatically generate component attributes
	if (decorator.name === "Component") {
		const newConfig = generateComponentConfig(state, node, properties);
		if (newConfig) properties = newConfig;
	}

	return f.update.object(config, [f.propertyDeclaration("type", decorator.name), ...properties]);
}
