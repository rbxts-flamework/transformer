import ts from "typescript";
import { Logger } from "../../classes/logger";
import { getSerializedTypeKind } from "./getSerializedTypeKind";
import {
	SerializedArray,
	SerializedClass,
	SerializedClassLike,
	SerializedFunction,
	SerializedFunctionSignature,
	SerializedIntersection,
	SerializedTuple,
	SerializedTupleFlags,
	SerializedType,
} from "./types";

const fail = (value: never) => Logger.warn("Unhandled kind", value);
export function serializeType(type: ts.Type): SerializedType {
	const backrefs = new Map<ts.Type, SerializedType>();
	return serializeType(type);

	function serializeType(type: ts.Type): SerializedType {
		const constraint = type.getConstraint();
		if (constraint && type !== constraint) {
			return serializeType(constraint);
		}

		// This type has already been constructed,
		// or is in the processing of being constructed.
		const backref = backrefs.get(type);
		if (backref) return backref;

		const name = type.symbol ? type.symbol.name : (type as ts.IntrinsicType).intrinsicName ?? "__type";
		const serialization: SerializedType = {
			kind: getSerializedTypeKind(type),
			name,
		};
		backrefs.set(type, serialization);

		switch (serialization.kind) {
			case "intrinsic":
				// The name is enough for intrinsic types.
				break;
			case "object":
				// Objects (e.g interfaces) don't currently need serialization.
				break;
			case "array":
				serializeArray(type as ts.TypeReference, serialization);
				break;
			case "class":
				serializeClass(type, serialization);
				break;
			case "union":
			case "intersection":
				serializeUnionOrIntersectionType(type as ts.UnionOrIntersectionType, serialization);
				break;
			case "tuple":
				serializeTuple(type as ts.TupleTypeReference, serialization);
				break;
			case "function":
				serializeFunctionType(type, serialization);
				break;
			default:
				fail(serialization.kind);
		}

		return serialization;
	}

	function serializeArray(type: ts.TypeReference, serialization: SerializedArray) {
		const target = type.resolvedTypeArguments?.[0];
		if (!target) throw "FAILURE";

		serialization.elementType = serializeType(target);
	}

	function serializeTuple(type: ts.TupleTypeReference, serialization: SerializedTuple) {
		const tuple = type.target;
		serialization.elementFlags ??= [];
		serialization.elements ??= [];
		type.checker.getTypeArguments(type).forEach((element, index) => {
			const flags = tuple.elementFlags[index];
			serialization.elements![index] = serializeType(element);
			serialization.elementFlags![index] = flags & ts.ElementFlags.Rest ? SerializedTupleFlags.Rest : 0;
		});
	}

	function serializeUnionOrIntersectionType(type: ts.UnionOrIntersectionType, serialization: SerializedIntersection) {
		serialization.types = type.types.map(serializeType);
	}

	function serializeClassSymbol(
		typeChecker: ts.TypeChecker,
		symbol: ts.Symbol,
		entryPointId: "exports" | "members",
		serialization: SerializedClassLike,
	) {
		const entryPoint = symbol[entryPointId];
		if (entryPoint) {
			serialization.members ??= [];
			entryPoint.forEach((symbol) => {
				const declaration = symbol.valueDeclaration;
				if (declaration) {
					serialization.members!.push({
						name: symbol.name,
						type: serializeType(typeChecker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)),
						visibility: getDeclarationVisibility(declaration),
					});
				}
			});
		}
	}

	function serializeClass(type: ts.Type, serialization: SerializedClass) {
		serialization.static = { ...serialization };
		serializeClassSymbol(type.checker, type.symbol, "exports", serialization.static);
		serializeClassSymbol(type.checker, type.symbol, "members", serialization);

		const constructorSymbol = type.symbol.members?.get("__constructor" as ts.__String);
		if (constructorSymbol) {
			serialization.construct = { kind: "function", name: "constructor" };
			serializeFunctionSymbol(type.checker, constructorSymbol, serialization.construct, true);
		}
	}

	function serializeFunctionSignature(
		typeChecker: ts.TypeChecker,
		signature: ts.Signature,
		serialization: SerializedFunctionSignature,
		noReturn = false,
	) {
		serialization.parameters ??= [];
		if (!noReturn || true) serialization.returnType = serializeType(signature.getReturnType());
		for (const parameter of signature.getParameters()) {
			const parameterDeclaration = parameter.valueDeclaration! as ts.ParameterDeclaration;
			serialization.parameters.push({
				name: parameter.name,
				type: serializeType(typeChecker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration)),
				isSpread: parameterDeclaration.dotDotDotToken !== undefined,
			});
		}
	}

	function serializeFunctionSymbol(
		typeChecker: ts.TypeChecker,
		symbol: ts.Symbol,
		serialization: SerializedFunction,
		noReturn = false,
	) {
		if (!symbol.declarations) return;
		serialization.signatures ??= [];

		for (const declaration of symbol.declarations) {
			if (!isSignatureDeclaration(declaration)) return;
			const signature = typeChecker.getSignatureFromDeclaration(declaration);
			if (!signature) continue;

			const serializedSignature = {};
			serializeFunctionSignature(typeChecker, signature, serializedSignature, noReturn);
			serialization.signatures.push(serializedSignature);
		}
	}

	function serializeFunctionType(type: ts.Type, serialization: SerializedFunction) {
		serialization.signatures ??= [];
		for (const signature of type.getCallSignatures()) {
			const serializedSignature = {};
			serializeFunctionSignature(type.checker, signature, serializedSignature);
			serialization.signatures.push(serializedSignature);
		}
	}
}

function getDeclarationVisibility(node: ts.Declaration): "public" | "private" | "protected" {
	if (ts.isPropertyDeclaration(node) && node.modifierFlagsCache) {
		const flags = node.modifierFlagsCache;
		if (flags & ts.ModifierFlags.Public) {
			return "public";
		} else if (flags & ts.ModifierFlags.Private) {
			return "private";
		} else if (flags & ts.ModifierFlags.Protected) {
			return "protected";
		}
	}
	return "public";
}

function isSignatureDeclaration(node: ts.Node): node is ts.SignatureDeclaration {
	return (
		ts.isConstructorDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionTypeNode(node) ||
		ts.isConstructorTypeNode(node) ||
		ts.isCallSignatureDeclaration(node) ||
		ts.isMethodSignature(node) ||
		ts.isConstructSignatureDeclaration(node) ||
		ts.isIndexSignatureDeclaration(node)
	);
}
