import assert from "assert";
import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { NodeMetadata } from "../../classes/nodeMetadata";
import { TransformState } from "../../classes/transformState";
import { f } from "../../util/factory";
import { buildGuardFromType, buildGuardsFromType } from "../../util/functions/buildGuardFromType";
import { getSuperClasses } from "../../util/functions/getSuperClasses";
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

		if (implementClauses.length > 0 && metadata.isRequested("flamework:implements")) {
			fields.push(["flamework:implements", f.array(implementClauses, false)]);
		}
	}

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

	return [updateClass(state, node), ...realFields];
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
		const componentConfig = updateComponentConfig(state, declaration, [...baseConfig.properties]);
		return [
			f.update.object(
				baseConfig,
				componentConfig.map((v) => (baseConfig.properties.includes(v) ? state.transformNode(v) : v)),
			),
		];
	}

	return expr.arguments.map((v) => state.transformNode(v));
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

	const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
	if (decorators) {
		for (const decorator of decorators) {
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
							identifier,
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

function updateClass(state: TransformState, node: ts.ClassDeclaration) {
	const modifiers = getAllModifiers(node);
	return f.update.classDeclaration(
		node,
		node.name ? state.transformNode(node.name) : undefined,
		node.members
			.map((node) => state.transformNode(node))
			.map((member) => {
				// Strip Flamework decorators from members
				const modifiers = getAllModifiers(member);
				if (modifiers) {
					const filteredModifiers = transformModifiers(state, modifiers);
					if (f.is.propertyDeclaration(member)) {
						return f.update.propertyDeclaration(member, undefined, undefined, filteredModifiers);
					} else if (f.is.methodDeclaration(member)) {
						return f.update.methodDeclaration(
							member,
							undefined,
							undefined,
							undefined,
							undefined,
							filteredModifiers,
						);
					}
				}

				return member;
			}),
		node.heritageClauses,
		node.typeParameters,
		modifiers && transformModifiers(state, modifiers),
	);
}

function getAllModifiers(node: ts.Node) {
	return ts.canHaveDecorators(node) || ts.canHaveModifiers(node) ? node.modifiers : undefined;
}

function transformModifiers(state: TransformState, modifiers: readonly ts.ModifierLike[]) {
	return modifiers
		.filter((modifier) => {
			if (!ts.isDecorator(modifier)) return true;
			const type = state.typeChecker.getTypeAtLocation(modifier.expression);
			return type.getProperty("_flamework_Decorator") === undefined;
		})
		.map((decorator) => state.transform(decorator));
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
				f.update.object(attributes.initializer, [
					...attributes.initializer.properties.map((v) => state.transformNode(v)),
					...filteredGuards,
				]),
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
