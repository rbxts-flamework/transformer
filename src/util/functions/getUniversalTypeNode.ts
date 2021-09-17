import ts from "typescript";
import { f } from "../factory";

const FORMAT_FLAGS =
	(ts.TypeFormatFlags.UseFullyQualifiedType | ts.TypeFormatFlags.WriteClassExpressionAsTypeLiteral) &
	ts.TypeFormatFlags.NodeBuilderFlagsMask;

/**
 * Returns a TypeNode generator that will attempt to create a TypeNode accessible from location.
 * Otherwise, returns undefined.
 */
export function getUniversalTypeNodeGenerator(location: ts.Node) {
	const visitingTypes = new Set<ts.Type>();
	const prereqs = new Array<ts.TypeAliasDeclaration>();
	const prereq = new Map<ts.Type, ts.Identifier>();
	return { generate, prereqs };

	function generate(type: ts.Type): ts.TypeNode | undefined {
		const prereqId = prereq.get(type);
		if (prereqId) {
			return f.referenceType(prereqId);
		}

		if (visitingTypes.has(type)) {
			// recursive type
			return f.referenceType(getPrereq(type));
		}

		visitingTypes.add(type);
		const generatedType = generateInner(type);
		visitingTypes.delete(type);

		if (generatedType) {
			const prereqId = prereq.get(type);
			if (prereqId) {
				prereqs.push(f.typeAliasDeclaration(prereqId, generatedType));
				return f.referenceType(prereqId);
			}

			return generatedType;
		}
	}

	function generateInner(type: ts.Type) {
		if (type.isUnionOrIntersection()) {
			const types = new Array<ts.TypeNode>();
			for (const subtype of type.types) {
				const typeNode = generate(subtype);
				if (!typeNode) return;

				types.push(typeNode);
			}
			return type.isIntersection() ? f.intersectionType(types) : f.unionType(types);
		}

		const callSignatures = type.getCallSignatures();
		if (callSignatures.length && !type.getProperties().length) {
			const declarations = getCallSignatures(type);
			if (!declarations) return;
			return f.typeLiteralType(declarations);
		}

		if (type.isLiteral() || type.flags & ts.TypeFlags.TemplateLiteral || type.flags & ts.TypeFlags.Intrinsic) {
			return type.checker.typeToTypeNode(type, location, undefined);
		}

		if (type.symbol) {
			const accessibility = type.checker.isSymbolAccessible(type.symbol, location, ts.SymbolFlags.Type, false);
			if (accessibility.accessibility === ts.SymbolAccessibility.Accessible) {
				if (isReferenceType(type)) {
					const typeArguments = new Array<ts.TypeNode>();
					for (const typeArgument of type.resolvedTypeArguments ?? []) {
						const generatedType = generate(typeArgument);
						if (!generatedType) return;

						typeArguments.push(generatedType);
					}

					return getTypeReference(type, typeArguments);
				}

				return getTypeReference(type);
			}

			if (type.isClassOrInterface()) {
				return getUniversalObjectTypeNode(type);
			}
		}

		if (isObjectLiteralType(type)) {
			return getUniversalObjectTypeNode(type);
		}
	}

	function getPrereq(type: ts.Type) {
		let prereqId = prereq.get(type);
		if (!prereqId) prereq.set(type, (prereqId = f.identifier("typeAlias", true)));

		return prereqId;
	}

	function getUniversalObjectTypeNode(type: ts.Type) {
		const members = new Array<ts.TypeElement>();
		members.push(...(getCallSignatures(type) ?? []));

		for (const prop of type.getApparentProperties()) {
			const propType = type.checker.getTypeOfPropertyOfType(type, prop.name);
			if (!propType) return undefined;

			const universalTypeNode = generate(propType);
			if (!universalTypeNode) return undefined;

			members.push(
				f.propertySignatureType(prop.name, universalTypeNode, propType.checker.isNullableType(propType)),
			);
		}

		const numberIndexType = type.getNumberIndexType();
		if (numberIndexType) {
			const accessibleType = generate(numberIndexType);
			if (accessibleType) {
				members.push(f.indexSignatureType(f.keywordType(ts.SyntaxKind.NumberKeyword), accessibleType));
			}
		}

		const stringIndexType = type.getStringIndexType();
		if (stringIndexType) {
			const accessibleType = generate(stringIndexType);
			if (accessibleType) {
				members.push(f.indexSignatureType(f.keywordType(ts.SyntaxKind.StringKeyword), accessibleType));
			}
		}

		return f.typeLiteralType(members);
	}

	function getCallSignatures(type: ts.Type) {
		const signatures = new Array<ts.CallSignatureDeclaration>();
		for (const signature of type.getCallSignatures()) {
			const returnTypeNode = generate(signature.getReturnType());
			if (!returnTypeNode) return;

			const parameterDeclarations = new Array<ts.ParameterDeclaration>();

			if (isMethod(signature, type.checker)) {
				parameterDeclarations.push(f.parameterDeclaration("this", f.keywordType(ts.SyntaxKind.AnyKeyword)));
			}

			for (const parameter of signature.getParameters()) {
				const parameterType = type.checker.getTypeOfSymbolAtLocation(parameter, location);
				const parameterTypeNode = generate(parameterType);
				if (!parameterTypeNode) return;

				parameterDeclarations.push(f.parameterDeclaration(parameter.name, parameterTypeNode));
			}
			signatures.push(f.callSignatureType(parameterDeclarations, returnTypeNode));
		}
		return signatures;
	}

	function getTypeReference(type: ts.Type, typeArguments?: ts.TypeNode[]) {
		const symbolChain = type.checker.getAccessibleSymbolChain(type.symbol, location, ts.SymbolFlags.Type, false);
		const typeNode = type.checker.typeToTypeNode(type, location, FORMAT_FLAGS);
		const isTypeOf = f.is.queryType(typeNode) || (f.is.importType(typeNode) && typeNode.isTypeOf);

		if (symbolChain) {
			const accessibleTypeNode = getQualifiedName(symbolChain.map((x) => x.name));
			if (accessibleTypeNode) {
				return isTypeOf ? f.queryType(accessibleTypeNode) : f.referenceType(accessibleTypeNode, typeArguments);
			}
		} else {
			const [filePath, ...segments] = type.checker.getFullyQualifiedName(type.symbol).split(".");
			const accessibleTypeNode = getQualifiedName(segments);
			return f.importType(filePath.substr(1, filePath.length - 2), accessibleTypeNode, isTypeOf, typeArguments);
		}
	}

	function getQualifiedName(segments: string[]) {
		if (segments.length === 0) return;
		let qualifiedName: ts.QualifiedName | ts.Identifier | undefined = f.identifier(segments[0]);
		for (let i = segments.length - 1; i > 0; i--) {
			const segment = segments[i];
			qualifiedName = f.qualifiedNameType(qualifiedName, segment);
		}
		return qualifiedName;
	}
}

function isMethodDeclaration(node: ts.Node, typeChecker: ts.TypeChecker): boolean {
	if (ts.isFunctionLike(node)) {
		const thisParam = node.parameters[0];
		if (thisParam && f.is.identifier(thisParam.name) && ts.isThisIdentifier(thisParam.name)) {
			return !(typeChecker.getTypeAtLocation(thisParam.name).flags & ts.TypeFlags.Void);
		} else {
			if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
				return true;
			}

			return false;
		}
	}
	return false;
}

function isMethod(signature: ts.Signature, typeChecker: ts.TypeChecker) {
	const thisParameter = signature.thisParameter?.valueDeclaration;
	if (thisParameter) {
		if (!(typeChecker.getTypeAtLocation(thisParameter).flags & ts.TypeFlags.Void)) {
			return true;
		}
	} else if (signature.declaration) {
		if (isMethodDeclaration(signature.declaration, typeChecker)) {
			return true;
		}
	}
	return false;
}

function isObjectLiteralType(type: ts.Type): type is ts.InterfaceType {
	return !type.isClassOrInterface() && (type.flags & ts.TypeFlags.Object) !== 0;
}

function isReferenceType(type: ts.Type): type is ts.TypeReference {
	return (ts.getObjectFlags(type) & ts.ObjectFlags.Reference) !== 0;
}
