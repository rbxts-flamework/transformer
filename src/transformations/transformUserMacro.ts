import { randomUUID } from "crypto";
import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { f } from "../util/factory";
import { buildGuardFromType } from "../util/functions/buildGuardFromType";
import { getTypeUid } from "../util/uid";

export function transformUserMacro<T extends ts.NewExpression | ts.CallExpression>(
	state: TransformState,
	node: T,
	signature: ts.Signature,
): T | undefined {
	const args = node.arguments ? [...node.arguments] : [];
	const parameters = new Map<number, UserMacro>();
	let highestParameterIndex = -1;
	for (let i = 0; i < getParameterCount(state, signature); i++) {
		const targetParameter = state.typeChecker.getParameterType(signature, i).getNonNullableType();
		const userMacro = getUserMacroOfType(state, node, targetParameter);
		if (userMacro) {
			parameters.set(i, userMacro);
			highestParameterIndex = Math.max(highestParameterIndex, i);
		}
	}

	for (let i = 0; i <= highestParameterIndex; i++) {
		const userMacro = parameters.get(i);
		if (userMacro && isUndefinedArgument(args[i])) {
			args[i] = buildUserMacro(state, node, userMacro);
		} else {
			args[i] = args[i] ? state.transform(args[i]) : f.nil();
		}
	}

	if (highestParameterIndex >= 0) {
		if (ts.isNewExpression(node)) {
			return ts.factory.updateNewExpression(
				node,
				state.transformNode(node.expression),
				node.typeArguments,
				args,
			) as T;
		} else if (ts.isCallExpression(node)) {
			return ts.factory.updateCallExpression(
				node,
				state.transformNode(node.expression),
				node.typeArguments,
				args,
			) as T;
		} else {
			Diagnostics.error(node, `Macro could not be transformed.`);
		}
	}

	return state.transform(node);
}

function isUndefinedArgument(argument: ts.Node | undefined) {
	return argument ? f.is.identifier(argument) && argument.text === "undefined" : true;
}

function buildUserMacro(state: TransformState, node: ts.Node, macro: UserMacro): ts.Expression {
	const members = new Array<[string, ts.Expression]>();

	if (macro.kind === "generic") {
		if (macro.metadata.has("id")) {
			members.push(["id", f.string(getTypeUid(state, macro.target, node))]);
		}

		if (macro.metadata.has("guard")) {
			members.push(["guard", buildGuardFromType(state, node.getSourceFile(), macro.target)]);
		}

		if (macro.metadata.has("text")) {
			members.push(["text", f.string(state.typeChecker.typeToString(macro.target))]);
		}
	} else if (macro.kind === "caller") {
		const lineAndCharacter = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart());

		if (macro.metadata.has("line")) {
			members.push(["line", f.number(lineAndCharacter.line + 1)]);
		}

		if (macro.metadata.has("character")) {
			members.push(["character", f.number(lineAndCharacter.character + 1)]);
		}

		if (macro.metadata.has("width")) {
			members.push(["width", f.number(node.getWidth())]);
		}

		if (macro.metadata.has("uuid")) {
			members.push(["uuid", f.string(randomUUID())]);
		}

		if (macro.metadata.has("text")) {
			members.push(["text", f.string(node.getText())]);
		}
	} else if (macro.kind === "many") {
		if (Array.isArray(macro.members)) {
			return f.asNever(f.array(macro.members.map((userMacro) => buildUserMacro(state, node, userMacro))));
		} else {
			const elements = new Array<ts.ObjectLiteralElementLike>();

			for (const [name, userMacro] of macro.members) {
				elements.push(f.propertyAssignmentDeclaration(f.string(name), buildUserMacro(state, node, userMacro)));
			}

			return f.asNever(f.object(elements, false));
		}
	} else if (macro.kind === "literal") {
		const value = macro.value;
		return typeof value === "string"
			? f.string(value)
			: typeof value === "number"
			? f.number(value)
			: typeof value === "boolean"
			? f.bool(value)
			: f.nil();
	}

	const modding = state.addFileImport(node.getSourceFile(), "@flamework/core", "Modding");
	if (members.length === 1) {
		return f.call(f.propertyAccessExpression(modding, f.identifier("macro")), [members[0][0], members[0][1]]);
	}

	return f.call(f.propertyAccessExpression(modding, f.identifier("macro")), [
		f.array(members.map(([name, value]) => f.array([f.string(name), value]))),
	]);
}

function getMetadataFromType(metadataType: ts.Type) {
	const metadata = new Set<string>();

	// Metadata is represented as { [k in Metadata]: k } to preserve assignability.
	for (const property of metadataType.checker.getPropertiesOfType(metadataType)) {
		metadata.add(property.name);
	}

	return metadata;
}

function getUserMacroOfMany(state: TransformState, node: ts.Node, target: ts.Type): UserMacro | undefined {
	const basicUserMacro = getBasicUserMacro(state, target);
	if (basicUserMacro) {
		return basicUserMacro;
	}

	if (isTupleType(state, target)) {
		const userMacros = new Array<UserMacro>();

		for (const member of state.typeChecker.getTypeArguments(target)) {
			const userMacro = getUserMacroOfMany(state, node, member);
			if (!userMacro) return;

			userMacros.push(userMacro);
		}

		return {
			kind: "many",
			members: userMacros,
		};
	} else if (state.typeChecker.isArrayType(target)) {
		const targetType = state.typeChecker.getTypeArguments(target as ts.TypeReference)[0];
		const constituents = targetType.isUnion() ? targetType.types : [targetType];
		const userMacros = new Array<UserMacro>();

		for (const member of constituents) {
			const userMacro = getUserMacroOfMany(state, node, member);
			if (!userMacro) return;

			userMacros.push(userMacro);
		}

		return {
			kind: "many",
			members: userMacros,
		};
	} else if (isObjectType(target)) {
		const userMacros = new Map<string, UserMacro>();

		for (const member of target.getProperties()) {
			const memberType = state.typeChecker.getTypeOfPropertyOfType(target, member.name);
			if (!memberType) return;

			const userMacro = getUserMacroOfMany(state, node, memberType);
			if (!userMacro) return;

			userMacros.set(member.name, userMacro);
		}

		return {
			kind: "many",
			members: userMacros,
		};
	} else if (target.isStringLiteral() || target.isNumberLiteral()) {
		return {
			kind: "literal",
			value: target.value,
		};
	} else if (target.flags & ts.TypeFlags.Undefined) {
		return {
			kind: "literal",
			value: undefined,
		};
	} else if (target.flags & ts.TypeFlags.BooleanLiteral) {
		return {
			kind: "literal",
			value: (target as ts.FreshableType).regularType === state.typeChecker.getTrueType() ? true : false,
		};
	}

	Diagnostics.error(node, `Unknown type '${target.checker.typeToString(target)}' encountered`);
}

function getBasicUserMacro(state: TransformState, target: ts.Type): UserMacro | undefined {
	const genericMetadata = state.typeChecker.getTypeOfPropertyOfType(target, "_flamework_macro_generic");
	if (genericMetadata) {
		const targetType = state.typeChecker.getTypeOfPropertyOfType(genericMetadata, "0");
		const metadataType = state.typeChecker.getTypeOfPropertyOfType(genericMetadata, "1");
		if (!targetType) return;
		if (!metadataType) return;

		const metadata = getMetadataFromType(metadataType);
		if (!metadata) return;

		return {
			kind: "generic",
			target: targetType,
			metadata,
		};
	}

	const callerMetadata = state.typeChecker.getTypeOfPropertyOfType(target, "_flamework_macro_caller");
	if (callerMetadata) {
		const metadata = getMetadataFromType(callerMetadata);
		if (!metadata) return;

		return {
			kind: "caller",
			metadata,
		};
	}
}

function getUserMacroOfType(state: TransformState, node: ts.Node, target: ts.Type): UserMacro | undefined {
	const manyMetadata = state.typeChecker.getTypeOfPropertyOfType(target, "_flamework_macro_many");
	if (manyMetadata) {
		return getUserMacroOfMany(state, node, manyMetadata);
	} else {
		return getBasicUserMacro(state, target);
	}
}

function isTupleType(state: TransformState, type: ts.Type): type is ts.TupleTypeReference {
	return state.typeChecker.isTupleType(type);
}

function isObjectType(type: ts.Type): boolean {
	return type.isIntersection() ? type.types.every(isObjectType) : (type.flags & ts.TypeFlags.Object) !== 0;
}

function getParameterCount(state: TransformState, signature: ts.Signature) {
	const length = signature.parameters.length;
	if (ts.signatureHasRestParameter(signature)) {
		const restType = state.typeChecker.getTypeOfSymbol(signature.parameters[length - 1]);
		if (isTupleType(state, restType)) {
			return length + restType.target.fixedLength - (restType.target.hasRestElement ? 0 : 1);
		}
	}
	return length;
}

type UserMacro =
	| {
			kind: "generic";
			target: ts.Type;
			metadata: Set<string>;
	  }
	| {
			kind: "caller";
			metadata: Set<string>;
	  }
	| {
			kind: "many";
			members: Map<string, UserMacro> | Array<UserMacro>;
	  }
	| {
			kind: "literal";
			value: string | number | boolean | undefined;
	  };
