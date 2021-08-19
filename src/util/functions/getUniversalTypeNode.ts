import ts from "typescript";
import { f } from "../factory";

/**
 * Retrieves a TypeNode usable from any location, if it's possible to.
 * Otherwise, returns undefined.
 */
export function getUniversalTypeNode(location: ts.Node, type: ts.Type): ts.TypeNode | undefined {
	if (type.isUnionOrIntersection()) {
		const types = new Array<ts.TypeNode>();
		for (const subtype of type.types) {
			const typeNode = getUniversalTypeNode(location, subtype);
			if (!typeNode) return;

			types.push(typeNode);
		}
		return type.isIntersection() ? f.intersectionType(types) : f.unionType(types);
	}

	const callSignatures = type.getCallSignatures();
	if (callSignatures.length && !type.getProperties().length) {
		const declarations = getCallSignatures(location, type);
		if (!declarations) return;
		return f.typeLiteralType(declarations);
	}

	if (type.isLiteral() || (type.flags & ts.TypeFlags.Intrinsic) !== 0) {
		return type.checker.typeToTypeNode(type, location, undefined);
	}

	if (isObjectLiteralType(type)) {
		return getUniversalObjectTypeNode(location, type);
	}

	if (type.symbol) {
		if (type.checker.resolveName(type.symbol.name, location, ts.SymbolFlags.Type, false)) {
			return f.referenceType(type.symbol.name);
		}

		const accessibility = type.checker.isSymbolAccessible(type.symbol, location, ts.SymbolFlags.Type, false);
		if (accessibility.accessibility === ts.SymbolAccessibility.Accessible) {
			const symbolChain = type.checker.getAccessibleSymbolChain(
				type.symbol,
				location,
				ts.SymbolFlags.Type,
				false,
			);

			if (symbolChain) {
				const accessibleTypeNode = getFullTypeNode(symbolChain.map((x) => x.name));
				if (accessibleTypeNode) {
					return f.referenceType(accessibleTypeNode);
				}
			} else {
				const [filePath, ...segments] = type.checker.getFullyQualifiedName(type.symbol).split(".");
				const accessibleTypeNode = getFullTypeNode(segments);
				return f.importType(filePath.substr(1, filePath.length - 2), accessibleTypeNode);
			}
		}

		if (!type.isClass() && type.isClassOrInterface()) {
			return getUniversalObjectTypeNode(location, type);
		}
	}
}

function getUniversalObjectTypeNode(location: ts.Node, type: ts.Type) {
	const members = new Array<ts.TypeElement>();
	members.push(...(getCallSignatures(location, type) ?? []));

	for (const prop of type.getApparentProperties()) {
		const propType = type.checker.getTypeOfPropertyOfType(type, prop.name);
		if (!propType) return undefined;

		const universalTypeNode = getUniversalTypeNode(location, propType);
		if (!universalTypeNode) return undefined;

		members.push(f.propertySignatureType(prop.name, universalTypeNode));
	}

	const numberIndexType = type.getNumberIndexType();
	if (numberIndexType) {
		const accessibleType = getUniversalTypeNode(location, numberIndexType);
		if (accessibleType) {
			members.push(f.indexSignatureType(f.keywordType(ts.SyntaxKind.NumberKeyword), accessibleType));
		}
	}

	const stringIndexType = type.getStringIndexType();
	if (stringIndexType) {
		const accessibleType = getUniversalTypeNode(location, stringIndexType);
		if (accessibleType) {
			members.push(f.indexSignatureType(f.keywordType(ts.SyntaxKind.StringKeyword), accessibleType));
		}
	}

	return f.typeLiteralType(members);
}

function getCallSignatures(location: ts.Node, type: ts.Type) {
	const signatures = new Array<ts.CallSignatureDeclaration>();
	for (const signature of type.getCallSignatures()) {
		const returnTypeNode = getUniversalTypeNode(location, signature.getReturnType());
		if (!returnTypeNode) return;

		const parameterDeclarations = new Array<ts.ParameterDeclaration>();
		for (const parameter of signature.getParameters()) {
			const parameterType = type.checker.getTypeOfSymbolAtLocation(parameter, location);
			const parameterTypeNode = getUniversalTypeNode(location, parameterType);
			if (!parameterTypeNode) return;

			parameterDeclarations.push(f.parameterDeclaration(parameter.name, parameterTypeNode));
		}
		signatures.push(f.callSignatureType(parameterDeclarations, returnTypeNode));
	}
	return signatures;
}

function getFullTypeNode(segments: string[]) {
	if (segments.length === 0) return;
	let qualifiedName: ts.QualifiedName | ts.Identifier | undefined = f.identifier(segments[0]);
	for (let i = segments.length - 1; i > 0; i--) {
		const segment = segments[i];
		qualifiedName = f.qualifiedNameType(qualifiedName, segment);
	}
	return qualifiedName;
}

function isObjectLiteralType(type: ts.Type): type is ts.InterfaceType {
	return !type.isClassOrInterface() && (type.flags & ts.TypeFlags.Object) !== 0;
}
