import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { DecoratorInfo, DecoratorWithNodes } from "../../types/decorators";
import { f } from "../../util/factory";
import { addLeadingComment } from "../../util/functions/addLeadingComment";
import { buildGuardFromType, buildGuardsFromType } from "../../util/functions/buildGuardFromType";
import { getInferExpression } from "../../util/functions/getInferExpression";
import { getPrettyName } from "../../util/functions/getPrettyName";
import { getSuperClasses } from "../../util/functions/getSuperClasses";
import { getUniversalTypeNodeGenerator } from "../../util/functions/getUniversalTypeNode";
import { replaceValue } from "../../util/functions/replaceValue";

export function transformClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	const symbol = state.getSymbol(node);
	if (!symbol || !node.name) return state.transform(node);

	const classInfo = state.classes.get(symbol);
	if (!classInfo) return state.transform(node);

	const fields: [string, f.ConvertableExpression][] = [];

	fields.push(["identifier", state.getUid(node)]);
	fields.push(["flamework:isExternal", classInfo.isExternal]);

	const constructor = node.members.find((x): x is ts.ConstructorDeclaration => f.is.constructor(x));
	if (constructor) {
		const constructorDependencies = [];
		for (const param of constructor.parameters) {
			if (!f.is.referenceType(param.type)) Diagnostics.error(param, `Expected type reference`);

			const symbol = state.getSymbol(param.type.typeName);
			const declaration = symbol?.getDeclarations()?.[0];
			if (!declaration) Diagnostics.error(param, `Could not find declaration`);

			constructorDependencies.push(state.getUid(declaration));
		}
		if (constructor.parameters.length > 0) {
			fields.push(["flamework:dependencies", constructorDependencies]);
		}
	}

	if (node.heritageClauses) {
		const implementClauses = new Array<ts.StringLiteral>();
		for (const clause of node.heritageClauses) {
			if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;

			for (const type of clause.types) {
				if (!ts.isIdentifier(type.expression)) continue;

				const symbol = state.getSymbol(type.expression);
				const declaration = symbol?.declarations?.[0];
				if (!declaration) continue;

				implementClauses.push(f.string(state.getUid(declaration)));
			}
		}

		if (classInfo.decorators.some((x) => x.isFlameworkDecorator && x.name === "Component")) {
			const onStartId = state.getUid(state.symbolProvider.flameworkFile.get("OnStart").declarations![0]);
			if (!implementClauses.some((x) => x.text === onStartId)) {
				const existingOnStart = node.members.find((x) =>
					x.name && "text" in x.name ? x.name.text === "onStart" : false,
				);
				if (existingOnStart !== undefined) {
					Diagnostics.error(existingOnStart, "Components can not have a member named 'onStart'");
				}

				implementClauses.push(f.string(onStartId));
			}
		}

		if (implementClauses.length > 0) {
			fields.push(["flamework:implements", f.array(implementClauses, false)]);
		}
	}

	const decorators = classInfo.decorators.filter((x): x is DecoratorWithNodes => x.type === "WithNodes");
	const decoratorIds = new Array<string>();
	const decoratorConfigs = new Map<string, ts.Expression>();
	for (const decorator of decorators) {
		const id = state.getUid(decorator.declaration);
		const config = decorator.isFlameworkDecorator
			? generateFlameworkConfig(
					state,
					node,
					decorator,
					f.is.object(decorator.arguments[0]) ? decorator.arguments[0] : f.object([]),
			  )
			: f.object({ type: "Arbitrary", arguments: decorator.arguments });

		decoratorIds.push(id);
		decoratorConfigs.set(id, config);
	}

	fields.push(["flamework:decorators", decoratorIds]);
	for (const [id, config] of decoratorConfigs) {
		fields.push([`flamework:decorators.${id}`, config]);
	}

	const importIdentifier = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Reflect");
	const realFields = fields.map(([name, value]) =>
		f.statement(f.call(f.field(importIdentifier, "defineMetadata"), [node.name!, name, value])),
	);
	ts.addSyntheticLeadingComment(
		realFields[0],
		ts.SyntaxKind.SingleLineCommentTrivia,
		`(Flamework) ${node.name.text} metadata`,
	);

	return [updateClass(state, node, decorators), ...realFields];
}

function updateClass(state: TransformState, node: ts.ClassDeclaration, decorators: DecoratorWithNodes[]) {
	let members: ts.NodeArray<ts.ClassElement> | ts.ClassElement[] = node.members;

	if (decorators.some((x) => x.isFlameworkDecorator && x.name === "Component")) {
		let onStartIndex = members.findIndex((x) => x.name && "text" in x.name && x.name.text === "onStart");
		let onStart = members[onStartIndex];

		if (!onStart) {
			onStartIndex = 0;
			onStart = f.methodDeclaration("onStart", f.block([]));
			members = [onStart, ...members];
		}

		if (f.is.methodDeclaration(onStart) && onStart.body) {
			const propertyDeclarations = new Array<[string, ts.Expression, boolean]>();

			members = members.map((x) => {
				if (!f.is.propertyDeclaration(x)) return state.transformNode(x);
				if (!x.initializer) return state.transformNode(x);
				if (x.modifierFlagsCache & ts.ModifierFlags.Static) return state.transformNode(x);
				if (!("text" in x.name)) return state.transformNode(x);

				const type = state.typeChecker.getTypeAtLocation(x.name);
				if (!type) return state.transformNode(x);

				propertyDeclarations.push([
					x.name.text,
					x.initializer,
					(x.modifierFlagsCache & ts.ModifierFlags.Readonly) !== 0,
				]);

				if (x.type) {
					return f.update.propertyDeclaration(
						x,
						null,
						undefined,
						undefined,
						undefined,
						"!",
						x.questionToken ? f.unionType([x.type, f.keywordType(ts.SyntaxKind.UndefinedKeyword)]) : x.type,
					);
				} else {
					const generator = getUniversalTypeNodeGenerator(x);
					const validTypeNode = generator.generate(type);
					if (validTypeNode) {
						state.prereqList(generator.prereqs);
						return f.update.propertyDeclaration(
							x,
							null,
							undefined,
							undefined,
							undefined,
							"!",
							validTypeNode,
						);
					}

					// HACK: if the type can't be represented as a TypeNode,
					// use a generic function that returns nil to infer the type
					const inferExpression = getInferExpression(state, state.getSourceFile(node));
					return f.update.propertyDeclaration(x, f.call(inferExpression, [f.arrowFunction(x.initializer)]));
				}
			});

			const constructorStatements = new Array<ts.Statement>();
			const constructorIndex = members.findIndex((x) => f.is.constructor(x));
			const constructor = members[constructorIndex] as ts.ConstructorDeclaration;
			if (constructor) {
				const internalProp = f.identifier("constructor_parameters", true);
				if (constructor.parameters.length) {
					members.unshift(
						f.propertyDeclaration(
							internalProp,
							undefined,
							f.tupleType(constructor.parameters.map((x) => x.type!)),
						),
					);
				}

				const parameterNames = new Array<ts.Identifier>();
				const parameters = constructor.parameters.map((parameter) => {
					if (f.is.identifier(parameter.name)) {
						parameterNames.push(parameter.name);
						return parameter;
					} else {
						const tempId = f.identifier(getPrettyName(state, parameter.type, "binding"), true);
						parameterNames.push(tempId);
						constructorStatements.push(f.variableStatement(parameter.name, tempId));
						return f.update.parameterDeclaration(parameter, tempId);
					}
				});

				if (constructor.parameters.length) {
					constructorStatements.unshift(
						f.variableStatement(
							f.arrayBindingDeclaration(parameterNames),
							f.field(ts.factory.createThis(), internalProp),
						),
					);
				}

				const superCalls = new Array<ts.CallExpression>();
				ts.forEachChildRecursively(constructor, (node, parent) => {
					if (f.is.call(parent) && node.kind === ts.SyntaxKind.SuperKeyword) {
						superCalls.push(parent);
					}
				});

				if (superCalls.length > 1) Diagnostics.error(superCalls[1], "Expected one super() call in component");
				const superCall = state.transformNode(superCalls[0]);

				const setConstructorParameters = constructor.parameters.length
					? f.statement(
							f.binary(
								f.field(ts.factory.createThis(), internalProp),
								ts.SyntaxKind.EqualsToken,
								parameterNames,
							),
					  )
					: f.statement();

				constructorStatements.push(...constructor.body!.statements.filter((x) => x !== superCall?.parent));

				replaceValue(
					members,
					constructor,
					f.update.constructor(
						constructor,
						parameters,
						f.block(
							superCall ? [f.statement(superCall), setConstructorParameters] : [setConstructorParameters],
						),
					),
				);
			}

			const transformedProperties = propertyDeclarations.map(([name, initializer, isReadonly]) => {
				const readonlyThis =
					isReadonly &&
					f.as(
						f.self(),
						f.typeLiteralType([f.propertySignatureType(name, f.keywordType(ts.SyntaxKind.UnknownKeyword))]),
					);

				return f.statement(
					f.binary(f.field(readonlyThis || f.self(), name), f.token(ts.SyntaxKind.EqualsToken), initializer),
				);
			});

			const constructorBody = constructorStatements.length
				? addLeadingComment(f.block(constructorStatements), "Constructor Body")
				: f.statement();

			addLeadingComment(transformedProperties[0], "Property Declarations");
			addLeadingComment(onStart.body.statements[0], "OnStart Event");

			onStartIndex = members.findIndex((x) => x.name && "text" in x.name && x.name.text === "onStart");
			members[onStartIndex] = f.update.methodDeclaration(
				onStart,
				undefined,
				f.block([...transformedProperties, constructorBody, ...onStart.body.statements]),
			);
		}
	}

	return state.transform(f.update.classDeclaration(node, node.name, members, undefined));
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

function updateAttributeGuards(
	state: TransformState,
	node: ts.ClassDeclaration,
	properties: ts.ObjectLiteralElementLike[],
) {
	const type = state.typeChecker.getTypeAtLocation(node);
	const baseComponent = state.symbolProvider.componentsFile!.get("BaseComponent");

	const property = type.getProperty("attributes");
	if (!property || property.parent !== baseComponent) return;

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
		properties.push(f.propertyAssignmentDeclaration("attributes", f.object(filteredGuards)));
	}

	return properties;
}

function updateInstanceGuard(
	state: TransformState,
	node: ts.ClassDeclaration,
	properties: ts.ObjectLiteralElementLike[],
) {
	const type = state.typeChecker.getTypeAtLocation(node);
	const baseComponent = state.symbolProvider.componentsFile!.get("BaseComponent");

	const property = type.getProperty("instance");
	if (!property || property.parent !== baseComponent) return;

	const superClass = getSuperClasses(state.typeChecker, node)[0];
	if (!superClass) return;

	const customGuard = properties.find((x) => x.name && "text" in x.name && x.name.text === "instanceGuard");
	if (customGuard) return;

	const instanceType = state.typeChecker.getTypeOfSymbolAtLocation(property, node);
	if (!instanceType) return;

	const superType = state.typeChecker.getTypeAtLocation(superClass);
	const superProperty = superType.getProperty("instance");
	if (!superProperty) return;

	const superInstanceType = state.typeChecker.getTypeOfSymbolAtLocation(superProperty, superClass);
	if (!superInstanceType) return;

	if (!type.checker.isTypeAssignableTo(superInstanceType, instanceType)) {
		const guard = buildGuardFromType(state, state.getSourceFile(node), instanceType);
		properties.push(f.propertyAssignmentDeclaration("instanceGuard", guard));
	}

	return properties;
}

function updateComponentConfig(
	state: TransformState,
	node: ts.ClassDeclaration,
	properties: ts.ObjectLiteralElementLike[],
): ts.ObjectLiteralElementLike[] {
	properties = updateAttributeGuards(state, node, properties) ?? properties;
	properties = updateInstanceGuard(state, node, properties) ?? properties;
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
		properties = updateComponentConfig(state, node, properties);
	}

	return f.update.object(config, [f.propertyAssignmentDeclaration("type", decorator.name), ...properties]);
}
