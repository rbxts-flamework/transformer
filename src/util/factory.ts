import ts from "typescript";

/**
 * Shorthand factory methods.
 *
 * Naming scheme:
 *
 * f.expressionType
 * f.declarationTypeDeclaration
 * f.statementTypeStatement
 * f.typeNodeType
 *
 * f.is.*
 * f.update.*
 *
 * Examples:
 *
 * f.string()
 * f.classDeclaration()
 * f.ifStatement()
 */
export namespace f {
	let factory = ts.factory;

	export type ConvertableExpression = string | number | ts.Expression | Array<ConvertableExpression> | boolean;
	export function toExpression(
		expression: ConvertableExpression,
		stringFn: (param: string) => ts.Expression = string,
	): ts.Expression {
		if (typeof expression === "string") {
			return stringFn(expression);
		} else if (typeof expression === "number") {
			return number(expression);
		} else if (typeof expression === "boolean") {
			return bool(expression);
		} else if (Array.isArray(expression)) {
			return array(expression.map((x) => toExpression(x)));
		} else {
			return expression;
		}
	}

	/// Expressions

	export function string(str: string) {
		return factory.createStringLiteral(str);
	}

	export function bool(value: boolean) {
		return value ? factory.createTrue() : factory.createFalse();
	}

	export function array(values: ts.Expression[], multiLine = true) {
		return factory.createArrayLiteralExpression(values, multiLine);
	}

	export function number(value: number | string, flags?: ts.TokenFlags) {
		return factory.createNumericLiteral(value, flags);
	}

	export function identifier(name: string, unique = false) {
		return unique ? factory.createUniqueName(name) : factory.createIdentifier(name);
	}

	export function nil() {
		return identifier("undefined");
	}

	export function field(name: ts.Expression | string, property: ts.MemberName | string) {
		return factory.createPropertyAccessExpression(toExpression(name, identifier), property);
	}

	export function statement(expression: ConvertableExpression) {
		return factory.createExpressionStatement(toExpression(expression));
	}

	export function call(
		expression: ts.Expression | string,
		args?: ConvertableExpression[],
		typeArguments?: ts.TypeNode[],
	) {
		return factory.createCallExpression(
			toExpression(expression, identifier),
			typeArguments,
			args?.map((x) => toExpression(x)),
		);
	}

	export function object(
		properties:
			| ts.ObjectLiteralElementLike[]
			| { [key: string]: ConvertableExpression | Array<ConvertableExpression> },
		multiLine = true,
	) {
		if (Array.isArray(properties)) {
			return factory.createObjectLiteralExpression(properties, multiLine);
		} else {
			const realProperties: ts.ObjectLiteralElementLike[] = [];
			for (const key of Object.keys(properties)) {
				realProperties.push(propertyDeclaration(key, properties[key]));
			}
			return factory.createObjectLiteralExpression(realProperties, multiLine);
		}
	}

	export function as(expression: ts.Expression, node: ts.TypeNode, explicit = false) {
		return explicit
			? factory.createAsExpression(
					factory.createAsExpression(expression, keywordType(ts.SyntaxKind.UnknownKeyword)),
					node,
			  )
			: factory.createAsExpression(expression, node);
	}

	/// Statements
	/// Declarations

	export function propertyDeclaration(name: ts.PropertyName | string, value: ConvertableExpression) {
		return factory.createPropertyAssignment(typeof name === "string" ? string(name) : name, toExpression(value));
	}

	export function importDeclaration(
		path: string | ts.StringLiteral,
		imports?: (ts.Identifier | [string | ts.Identifier, ts.Identifier])[],
		defaultImport?: ts.Identifier,
		typeOnly = false,
	) {
		return factory.createImportDeclaration(
			undefined,
			undefined,
			factory.createImportClause(
				typeOnly,
				defaultImport,
				imports
					? factory.createNamedImports(
							imports.map((x) => {
								if (Array.isArray(x)) {
									return factory.createImportSpecifier(
										typeof x[0] === "string" ? f.identifier(x[0]) : x[0],
										x[1],
									);
								} else {
									return factory.createImportSpecifier(undefined, x);
								}
							}),
					  )
					: undefined,
			),
			toExpression(path),
		);
	}

	export function functionDeclaration(
		name: string | ts.Identifier,
		body?: ts.Block,
		parameters: ts.ParameterDeclaration[] = [],
		type?: ts.TypeNode,
		typeParams?: ts.TypeParameterDeclaration[],
	) {
		return factory.createFunctionDeclaration(
			undefined,
			undefined,
			undefined,
			name,
			typeParams,
			parameters,
			type,
			body,
		);
	}

	/// Type Nodes

	export function referenceType(typeName: string | ts.EntityName, typeArguments?: ts.TypeNode[]) {
		return factory.createTypeReferenceNode(typeName, typeArguments);
	}

	export function keywordType(kind: ts.KeywordTypeSyntaxKind) {
		return factory.createKeywordTypeNode(kind);
	}

	export function qualifiedNameType(left: ts.EntityName, right: string | ts.Identifier) {
		return factory.createQualifiedName(left, right);
	}

	export namespace is {
		/// Expressions

		export function string(node?: ts.Node): node is ts.StringLiteral {
			return node !== undefined && ts.isStringLiteral(node);
		}

		export function bool(node?: ts.Node): node is ts.BooleanLiteral {
			return node !== undefined && (node === f.bool(true) || node === f.bool(false));
		}

		export function array(node?: ts.Node): node is ts.ArrayLiteralExpression {
			return node !== undefined && ts.isArrayLiteralExpression(node);
		}

		export function number(node?: ts.Node): node is ts.NumericLiteral {
			return node !== undefined && ts.isNumericLiteral(node);
		}

		export function identifier(node?: ts.Node): node is ts.Identifier {
			return node !== undefined && ts.isIdentifier(node);
		}

		export function nil(node?: ts.Node): node is ts.Identifier & { text: "undefined " } {
			return node !== undefined && identifier(node) && node.text === "undefined";
		}

		export function call(node?: ts.Node): node is ts.CallExpression {
			return node !== undefined && ts.isCallExpression(node);
		}

		export function object(node?: ts.Node): node is ts.ObjectLiteralExpression {
			return node !== undefined && ts.isObjectLiteralExpression(node);
		}

		export function functionExpression(node?: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
			return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
		}

		export function omitted(node?: ts.Node): node is ts.OmittedExpression {
			return node !== undefined && ts.isOmittedExpression(node);
		}

		/// Statements
		/// Declarations

		export function constructor(node?: ts.Node): node is ts.ConstructorDeclaration {
			return node !== undefined && ts.isConstructorDeclaration(node);
		}

		export function propertyDeclaration(node?: ts.Node): node is ts.PropertyDeclaration {
			return node !== undefined && ts.isPropertyDeclaration(node);
		}

		export function propertyAssignmentDeclaration(node?: ts.Node): node is ts.PropertyAssignment {
			return node !== undefined && ts.isPropertyAssignment(node);
		}

		export function importDeclaration(node?: ts.Node): node is ts.ImportDeclaration {
			return node !== undefined && ts.isImportDeclaration(node);
		}

		export function classDeclaration(node?: ts.Node): node is ts.ClassDeclaration {
			return node !== undefined && ts.isClassDeclaration(node);
		}

		export function namespaceDeclaration(node?: ts.Node): node is ts.NamespaceDeclaration {
			return (
				(node !== undefined &&
					ts.isModuleDeclaration(node) &&
					identifier(node.name) &&
					node.body &&
					ts.isNamespaceBody(node.body)) ||
				false
			);
		}

		export function moduleBlockDeclaration(node?: ts.Node): node is ts.ModuleBlock {
			return node !== undefined && ts.isModuleBlock(node);
		}

		export function importClauseDeclaration(node?: ts.Node): node is ts.ImportClause {
			return node !== undefined && ts.isImportClause(node);
		}

		export function namedDeclaration(node?: ts.Node): node is ts.NamedDeclaration & { name: ts.DeclarationName } {
			return node !== undefined && ts.isNamedDeclaration(node);
		}

		export function interfaceDeclaration(node?: ts.Node): node is ts.InterfaceDeclaration {
			return node !== undefined && ts.isInterfaceDeclaration(node);
		}

		export function typeAliasDeclaration(node?: ts.Node): node is ts.TypeAliasDeclaration {
			return node !== undefined && ts.isTypeAliasDeclaration(node);
		}

		/// Type Nodes

		export function referenceType(node?: ts.Node): node is ts.TypeReferenceNode {
			return node !== undefined && ts.isTypeReferenceNode(node);
		}

		export function queryType(node?: ts.Node): node is ts.TypeQueryNode {
			return node !== undefined && ts.isTypeQueryNode(node);
		}

		/// OTHERS
		export function namedImports(node?: ts.Node): node is ts.NamedImports {
			return node !== undefined && ts.isNamedImports(node);
		}
	}

	export namespace update {
		/// Expressions

		export function call(
			node: ts.CallExpression,
			expression = node.expression,
			args?: ConvertableExpression[],
			typeArguments?: ts.TypeNode[],
		) {
			return factory.updateCallExpression(
				node,
				expression,
				typeArguments ?? node.typeArguments,
				args?.map((x) => toExpression(x)) ?? node.arguments,
			);
		}

		export function object(node: ts.ObjectLiteralExpression, properties?: ts.ObjectLiteralElementLike[]) {
			return factory.updateObjectLiteralExpression(node, properties ?? node.properties);
		}

		/// Statements
		/// Declarations

		export function classDeclaration(
			node: ts.ClassDeclaration,
			name = node.name,
			members = node.members,
			decorators?: Array<ts.Decorator>,
			heritageClauses = node.heritageClauses,
			typeParameters = node.typeParameters,
			modifiers = node.modifiers,
		) {
			return factory.updateClassDeclaration(
				node,
				decorators,
				modifiers,
				name,
				typeParameters,
				heritageClauses,
				members,
			);
		}

		export function propertyAssignmentDeclaration(
			node: ts.PropertyAssignment,
			initializer: ConvertableExpression = node.initializer,
			name: ts.PropertyName | string = node.name,
		) {
			return factory.updatePropertyAssignment(
				node,
				typeof name === "string" ? f.identifier(name) : name,
				toExpression(initializer),
			);
		}

		/// Type Nodes
		/// Other
		export function sourceFile(
			sourceFile: ts.SourceFile,
			statements: ts.NodeArray<ts.Statement> | ts.Statement[] = sourceFile.statements,
			isDeclarationFile = sourceFile.isDeclarationFile,
			referencedFiles = sourceFile.referencedFiles,
			typeReferences = sourceFile.typeReferenceDirectives,
			hasNoDefaultLib = sourceFile.hasNoDefaultLib,
			libReferences = sourceFile.libReferenceDirectives,
		) {
			return factory.updateSourceFile(
				sourceFile,
				statements,
				isDeclarationFile,
				referencedFiles,
				typeReferences,
				hasNoDefaultLib,
				libReferences,
			);
		}
	}

	export function setFactory(newFactory: ts.NodeFactory) {
		factory = newFactory;
	}
}
