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
	return { generate };

	function generate(type: ts.Type): ts.TypeNode | undefined {
		if (visitingTypes.has(type)) {
			// recursive type
			return undefined;
		}

		visitingTypes.add(type);
		const generatedType = generateInner(type);
		visitingTypes.delete(type);

		if (generatedType) {
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

		if (type.isLiteral() || (type.flags & ts.TypeFlags.Intrinsic) !== 0) {
			return type.checker.typeToTypeNode(type, location, undefined);
		}

		if (type.symbol) {
			const accessibility = type.checker.isSymbolAccessible(type.symbol, location, ts.SymbolFlags.Type, false);
			if (accessibility.accessibility === ts.SymbolAccessibility.Accessible) {
				if (!isTypeFullyAccessible(type)) {
					// TypeScript may format this type incorrectly, so assume it can't be generated.
					return;
				}
				return type.checker.typeToTypeNode(type, location, FORMAT_FLAGS);
			}

			if (type.isClassOrInterface()) {
				return getUniversalObjectTypeNode(type);
			}
		}

		if (isObjectLiteralType(type)) {
			return getUniversalObjectTypeNode(type);
		}
	}

	function getUniversalObjectTypeNode(type: ts.Type) {
		const members = new Array<ts.TypeElement>();
		members.push(...(getCallSignatures(type) ?? []));

		for (const prop of type.getApparentProperties()) {
			const propType = type.checker.getTypeOfPropertyOfType(type, prop.name);
			if (!propType) return undefined;

			const universalTypeNode = generate(propType);
			if (!universalTypeNode) return undefined;

			members.push(f.propertySignatureType(prop.name, universalTypeNode));
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

	function isTypeFullyAccessible(type: ts.Type) {
		if (isReferenceType(type) && type.resolvedTypeArguments) {
			for (const typeArgument of type.resolvedTypeArguments) {
				if (typeArgument.symbol) {
					const accessibility = type.checker.isSymbolAccessible(
						typeArgument.symbol,
						location,
						ts.SymbolFlags.Type,
						false,
					);
					if (accessibility.accessibility !== ts.SymbolAccessibility.Accessible) {
						return false;
					}
				}
			}
		}

		return true;
	}
}

function isMethod(signature: ts.Signature, typeChecker: ts.TypeChecker) {
	const thisParameter = signature.thisParameter?.valueDeclaration;
	if (thisParameter) {
		if (!(typeChecker.getTypeAtLocation(thisParameter).flags & ts.TypeFlags.Void)) {
			return true;
		}
	} else {
		if (f.is.methodDeclaration(signature.declaration)) {
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
