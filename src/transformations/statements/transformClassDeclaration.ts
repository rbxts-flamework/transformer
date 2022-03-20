import assert from "assert";
import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { NodeMetadata } from "../../classes/nodeMetadata";
import { TransformState } from "../../classes/transformState";
import { DecoratorWithNodes } from "../../types/decorators";
import { f } from "../../util/factory";
import { addLeadingComment } from "../../util/functions/addLeadingComment";
import { buildGuardFromType, buildGuardsFromType } from "../../util/functions/buildGuardFromType";
import { getInferExpression } from "../../util/functions/getInferExpression";
import { getPrettyName } from "../../util/functions/getPrettyName";
import { getSuperClasses } from "../../util/functions/getSuperClasses";
import { getUniversalTypeNodeGenerator } from "../../util/functions/getUniversalTypeNode";
import { replaceValue } from "../../util/functions/replaceValue";
import { getNodeUid, getSymbolUid, getTypeUid } from "../../util/uid";

export function transformClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	const symbol = state.getSymbol(node);
	if (!symbol || !node.name) return state.transform(node);

	const classInfo = state.classes.get(symbol);
	if (!classInfo) return state.transform(node);

	const fields: [string, f.ConvertableExpression][] = [];
	const metadata = new NodeMetadata(state, node);

	fields.push(["identifier", getNodeUid(state, node)]);

	const constructor = node.members.find((x): x is ts.ConstructorDeclaration => f.is.constructor(x));
	if (constructor) {
		fields.push(...generateMethodMetadata(state, metadata, constructor));
	}

	if (node.heritageClauses) {
		const implementClauses = new Array<ts.StringLiteral>();
		for (const clause of node.heritageClauses) {
			if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;

			for (const type of clause.types) {
				implementClauses.push(f.string(getNodeUid(state, type)));
			}
		}

		if (classInfo.decorators.some((x) => x.isFlameworkDecorator && x.name === "Component")) {
			const onStartId = getSymbolUid(state, state.symbolProvider.flameworkFile.get("OnStart"));
			assert(onStartId);
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

		if (implementClauses.length > 0 && metadata.isRequested("flamework:implements")) {
			fields.push(["flamework:implements", f.array(implementClauses, false)]);
		}
	}

	const decorators = classInfo.decorators.filter((x): x is DecoratorWithNodes => x.type === "WithNodes");
	const importIdentifier = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Reflect");
	const realFields: ts.Statement[] = fields.map(([name, value]) =>
		f.statement(f.call(f.field(importIdentifier, "defineMetadata"), [node.name!, name, value])),
	);

	realFields.push(...getDecoratorFields(state, node, node, metadata));
	for (const member of node.members) {
		if (!f.is.methodDeclaration(member) || member.body) {
			realFields.push(...getDecoratorFields(state, node, member));
		}
	}

	ts.addSyntheticLeadingComment(
		realFields[0],
		ts.SyntaxKind.SingleLineCommentTrivia,
		`(Flamework) ${node.name.text} metadata`,
	);

	return [updateClass(state, node, decorators), ...realFields];
}

function generateFieldMetadata(state: TransformState, metadata: NodeMetadata, field: ts.PropertyDeclaration) {
	const fields = new Array<[string, f.ConvertableExpression]>();
	const type = state.typeChecker.getTypeAtLocation(field);

	if (metadata.isRequested("flamework:type")) {
		if (!field.type) {
			const id = getTypeUid(state, type, field.name ?? field);
			fields.push(["flamework:type", id]);
		} else {
			const id = getNodeUid(state, field.type);
			fields.push(["flamework:type", id]);
		}
	}

	if (metadata.isRequested("flamework:guard")) {
		const guard = buildGuardFromType(state, state.getSourceFile(field), type);
		fields.push(["flamework:guard", guard]);
	}

	return fields;
}

function generateMethodMetadata(state: TransformState, metadata: NodeMetadata, method: ts.FunctionLikeDeclaration) {
	const fields = new Array<[string, f.ConvertableExpression]>();
	const baseSignature = state.typeChecker.getSignatureFromDeclaration(method);
	if (!baseSignature) return [];

	if (metadata.isRequested("flamework:return_type")) {
		if (!method.type) {
			const id = getTypeUid(state, baseSignature.getReturnType(), method.name ?? method);
			fields.push(["flamework:return_type", id]);
		} else {
			const id = getNodeUid(state, method.type);
			fields.push(["flamework:return_type", id]);
		}
	}

	if (metadata.isRequested("flamework:return_guard")) {
		const guard = buildGuardFromType(state, state.getSourceFile(method), baseSignature.getReturnType());
		fields.push(["flamework:return_guard", guard]);
	}

	const parameters = new Array<string>();
	const parameterNames = new Array<string>();
	const parameterGuards = new Array<ts.Expression>();

	for (const parameter of method.parameters) {
		if (metadata.isRequested("flamework:parameters")) {
			if (parameter.type) {
				const id = getNodeUid(state, parameter.type);
				parameters.push(id);
			} else {
				const type = state.typeChecker.getTypeAtLocation(parameter);
				const id = getTypeUid(state, type, parameter);
				parameters.push(id);
			}
		}

		if (metadata.isRequested("flamework:parameter_names")) {
			if (f.is.identifier(parameter.name)) {
				parameterNames.push(parameter.name.text);
			} else {
				parameterNames.push("_binding_");
			}
		}

		if (metadata.isRequested("flamework:parameter_guards")) {
			const type = state.typeChecker.getTypeAtLocation(parameter);
			const guard = buildGuardFromType(state, state.getSourceFile(method), type);
			parameterGuards.push(guard);
		}
	}

	if (parameters.length > 0) {
		fields.push(["flamework:parameters", parameters]);
	}

	if (parameterNames.length > 0) {
		fields.push(["flamework:parameter_names", parameterNames]);
	}

	if (parameterGuards.length > 0) {
		fields.push(["flamework:parameter_guards", parameterGuards]);
	}

	return fields;
}

function transformDecoratorConfig(
	state: TransformState,
	declaration: ts.ClassDeclaration,
	symbol: ts.Symbol,
	expr: ts.Expression,
) {
	if (!f.is.call(expr)) return [];

	if (symbol === state.symbolProvider.componentsFile?.get("Component")) {
		assert(!expr.arguments[0] || f.is.object(expr.arguments[0]));

		const baseConfig = expr.arguments[0] ? expr.arguments[0] : f.object([]);
		return [f.update.object(baseConfig, updateComponentConfig(state, declaration, [...baseConfig.properties]))];
	}

	return expr.arguments;
}

function getDecoratorFields(
	state: TransformState,
	declaration: ts.ClassDeclaration,
	node: ts.ClassDeclaration | ts.ClassElement,
	metadata = new NodeMetadata(state, node),
) {
	if (!node.name) return [];

	const symbol = state.getSymbol(node.name);
	const propertyName = ts.getNameFromPropertyName(node.name);
	assert(propertyName);
	assert(symbol);
	const importIdentifier = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Reflect");
	const decoratorStatements = new Array<ts.Statement>();

	let generatedMetadata;
	if (f.is.methodDeclaration(node)) {
		generatedMetadata = generateMethodMetadata(state, metadata, node);
	} else if (f.is.propertyDeclaration(node)) {
		generatedMetadata = generateFieldMetadata(state, metadata, node);
	}

	if (generatedMetadata) {
		decoratorStatements.push(
			...generatedMetadata.map(([name, value]) =>
				f.statement(
					f.call(f.field(importIdentifier, "defineMetadata"), [declaration.name!, name, value, propertyName]),
				),
			),
		);
	}

	if (node.decorators) {
		for (const decorator of node.decorators) {
			const expr = decorator.expression;
			const type = state.typeChecker.getTypeAtLocation(expr);
			if (type.getProperty("_flamework_Decorator")) {
				const identifier = f.is.call(expr) ? expr.expression : expr;
				const symbol = state.getSymbol(identifier);
				assert(symbol);
				assert(symbol.valueDeclaration);

				const args = transformDecoratorConfig(state, declaration, symbol, expr);
				const propertyArgs = !f.is.classDeclaration(node)
					? [propertyName, (node.modifierFlagsCache & ts.ModifierFlags.Static) !== 0]
					: [];

				decoratorStatements.push(
					f.statement(
						f.call(f.field(importIdentifier, "decorate"), [
							declaration.name!,
							getSymbolUid(state, symbol, identifier),
							f.as(identifier, f.keywordType(ts.SyntaxKind.NeverKeyword)),
							[...args],
							...propertyArgs,
						]),
					),
				);
			}
		}
	}

	if (decoratorStatements[0] && !f.is.classDeclaration(node)) {
		ts.addSyntheticLeadingComment(
			decoratorStatements[0],
			ts.SyntaxKind.SingleLineCommentTrivia,
			`(Flamework) ${declaration.name!.text}.${propertyName} metadata`,
		);
	}

	const constraintTypes = metadata.getType("constraint");
	const nodeType = state.typeChecker.getTypeOfSymbolAtLocation(symbol, node);
	for (const constraintType of constraintTypes ?? []) {
		if (!state.typeChecker.isTypeAssignableTo(nodeType, constraintType)) {
			Diagnostics.addDiagnostic(
				getAssignabilityDiagnostics(
					node.name ?? node,
					nodeType,
					constraintType,
					metadata.getTrace(constraintType),
				),
			);
		}
	}

	return decoratorStatements;
}

function formatType(type: ts.Type) {
	const typeNode = type.checker.typeToTypeNode(
		type,
		undefined,
		ts.NodeBuilderFlags.InTypeAlias | ts.NodeBuilderFlags.IgnoreErrors,
	)!;

	const printer = ts.createPrinter();
	return printer.printNode(ts.EmitHint.Unspecified, typeNode, undefined!);
}

function getAssignabilityDiagnostics(
	node: ts.Node,
	sourceType: ts.Type,
	constraintType: ts.Type,
	trace?: ts.Node,
): ts.DiagnosticWithLocation {
	const diagnostic = Diagnostics.createDiagnostic(
		node,
		ts.DiagnosticCategory.Error,
		`Type '${formatType(sourceType)}' does not satify constraint '${formatType(constraintType)}'`,
	);

	if (trace) {
		ts.addRelatedInfo(
			diagnostic,
			Diagnostics.createDiagnostic(trace, ts.DiagnosticCategory.Message, "The constraint is defined here."),
		);
	}

	return diagnostic;
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
			const propertyDeclarations = new Array<[ts.PropertyName, ts.Expression, boolean]>();

			members = members.map((member) => {
				if (!f.is.propertyDeclaration(member)) return state.transformNode(member);
				if (member.modifierFlagsCache & ts.ModifierFlags.Static) return state.transformNode(member);
				if (member.modifierFlagsCache & ts.ModifierFlags.Abstract) return state.transformNode(member);

				if (member.initializer) {
					propertyDeclarations.push([
						member.name,
						state.transformNode(member.initializer),
						(member.modifierFlagsCache & ts.ModifierFlags.Readonly) !== 0,
					]);
				}

				if (member.type) {
					return f.update.propertyDeclaration(
						member,
						null,
						undefined,
						undefined,
						undefined,
						member.questionToken ? "?" : "!",
						member.type,
					);
				}

				const type = state.typeChecker.getTypeAtLocation(member.name);
				const generator = getUniversalTypeNodeGenerator(member);
				const validTypeNode = generator.generate(type);
				if (validTypeNode) {
					state.prereqList(generator.prereqs);
					return f.update.propertyDeclaration(
						member,
						null,
						undefined,
						undefined,
						undefined,
						"!",
						validTypeNode,
					);
				}

				if (member.initializer) {
					// HACK: if the type can't be represented as a TypeNode,
					// use a generic function that returns nil to infer the type
					const inferExpression = getInferExpression(state, state.getSourceFile(node));
					return f.update.propertyDeclaration(
						member,
						f.call(inferExpression, [f.arrowFunction(member.initializer)]),
					);
				}

				return state.transformNode(member);
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

			const hasOnStart = shouldAddSuperOnStart(state, node);
			const overrideModifier =
				hasOnStart && !ts.findModifier(onStart, ts.SyntaxKind.OverrideKeyword)
					? [ts.factory.createModifier(ts.SyntaxKind.OverrideKeyword)]
					: [];

			const superOnStartStatement = hasOnStart
				? f.statement(f.call(f.field(f.superExpression(), "onStart")))
				: f.statement();

			const superOnStart = ts.forEachChildRecursively(onStart, (node) => {
				if (!f.is.call(node)) return;

				const expr = node.expression;
				if (!f.is.accessExpression(expr)) return;
				if (!f.is.superExpression(expr.expression)) return;

				if (f.is.propertyAccessExpression(expr)) {
					if (expr.name.text === "onStart") {
						return node;
					}
				} else if (f.is.elementAccessExpression(expr)) {
					if (f.is.string(expr.argumentExpression)) {
						return expr.argumentExpression.text === "onStart" ? expr : undefined;
					}
				}
			});

			if (superOnStart) {
				Diagnostics.error(superOnStart, "super.onStart() must be omitted.");
			}

			const transformedProperties = propertyDeclarations.map(([name, initializer, isReadonly]) => {
				const readonlyThis =
					isReadonly &&
					f.as(
						f.self(),
						f.typeLiteralType([f.propertySignatureType(name, f.keywordType(ts.SyntaxKind.UnknownKeyword))]),
						true,
					);

				return f.statement(
					f.binary(f.field(readonlyThis || f.self(), name), f.token(ts.SyntaxKind.EqualsToken), initializer),
				);
			});

			const constructorBody = constructorStatements.length
				? addLeadingComment(f.block(sanitizeConstructorBody(state, constructorStatements)), "Constructor Body")
				: f.statement();

			addLeadingComment(transformedProperties[0], "Property Declarations");
			addLeadingComment(onStart.body.statements[0], "OnStart Event");

			onStartIndex = members.findIndex((x) => x.name && "text" in x.name && x.name.text === "onStart");
			members[onStartIndex] = f.update.methodDeclaration(
				onStart,
				undefined,
				f.block([
					superOnStartStatement,
					...transformedProperties,
					constructorBody,
					...state.transformList(onStart.body.statements),
				]),
				undefined,
				undefined,
				undefined,
				onStart.modifiers ? [...onStart.modifiers, ...overrideModifier] : overrideModifier,
			);
		}
	} else {
		members = members.map((node) => state.transformNode(node));
	}

	return f.update.classDeclaration(
		node,
		node.name ? state.transformNode(node.name) : undefined,
		members,
		node.decorators?.filter((decorator) => {
			const type = state.typeChecker.getTypeAtLocation(decorator.expression);
			return type.getProperty("_flamework_Decorator") === undefined;
		}),
	);
}

function sanitizeConstructorBody(state: TransformState, statements: ts.Statement[]) {
	const visitor = (node: ts.Node): ts.Node => {
		if (f.is.accessExpression(node)) {
			const name = ts.getNameOfAccessExpression(node);
			const symbol = state.getSymbol(name);
			if (
				symbol &&
				symbol.valueDeclaration &&
				symbol.valueDeclaration.modifierFlagsCache & ts.ModifierFlags.Readonly &&
				f.is.propertyDeclaration(symbol.valueDeclaration)
			) {
				const sanitizedThis = f.as(f.self(), f.referenceType("Writable", [f.selfType()]), true);
				return f.is.elementAccessExpression(node)
					? f.elementAccessExpression(sanitizedThis, name as ts.Expression)
					: f.propertyAccessExpression(sanitizedThis, name as ts.MemberName);
			}
		}
		return ts.visitEachChild(node, visitor, state.context);
	};
	return statements.map((node) => ts.visitNode(node, visitor));
}

function shouldAddSuperOnStart(state: TransformState, node: ts.ClassDeclaration) {
	const superClass = getSuperClasses(state.typeChecker, node)[0];
	if (!superClass) return false;

	const symbol = state.getSymbol(superClass);
	if (!symbol) Diagnostics.error(superClass.name ?? node.name ?? node, "Could not find symbol");

	if (symbol.members?.has("onStart" as ts.__String)) return true;

	const classInfo = state.classes.get(symbol);
	if (!classInfo) return false;

	return classInfo.decorators.some((x) => x.isFlameworkDecorator && x.name === "Component");
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
