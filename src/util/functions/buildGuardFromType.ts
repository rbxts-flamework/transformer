import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";
import { getDeclarationOfType } from "./getDeclarationOfType";
import { getInstanceTypeFromType } from "./getInstanceTypeFromType";

/**
 * Convert a type into a list of typeguards.
 * @param state The TransformState
 * @param file The file that this type belongs to
 * @param type The type to convert
 * @param isInterfaceType Determines whether unknown should be omitted.
 * @returns An array of property assignments.
 */
export function buildGuardsFromType(
	state: TransformState,
	file: ts.SourceFile,
	type: ts.Type,
	isInterfaceType = false,
): ts.PropertyAssignment[] {
	const typeChecker = state.typeChecker;
	const diagnosticsLocation = getDeclarationOfType(type) ?? file;

	const guards = new Array<ts.PropertyAssignment>();
	for (const property of type.getProperties()) {
		const propertyType = typeChecker.getTypeOfPropertyOfType(type, property.name);
		if (!propertyType) Diagnostics.error(diagnosticsLocation, "Could not find type for field");

		if (isInterfaceType && (propertyType.flags & ts.TypeFlags.Unknown) !== 0) {
			continue;
		}

		const attribute = buildGuardFromType(state, file, propertyType);
		guards.push(f.propertyAssignmentDeclaration(property.name, attribute));
	}
	return guards;
}

const rbxTypes = [
	"UDim",
	"UDim2",
	"BrickColor",
	"Color3",
	"Vector2",
	"Vector3",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"NumberRange",
	"Rect",
	"DockWidgetPluginGuiInfo",
	"CFrame",
	"Axes",
	"Faces",
	"Instance",
	"Ray",
	"Random",
	"Region3",
	"Region3int16",
	"Enum",
	"TweenInfo",
	"PhysicalProperties",
	"Vector3int16",
	"Vector2int16",
	"PathWaypoint",
	"EnumItem",
	"RBXScriptSignal",
	"RBXScriptConnection",
	"thread",
] as const;

/**
 * Convert a type into a type guard.
 * @param state The TransformState
 * @param file The file that this type belongs to
 * @param type The type to convert
 * @returns An array of property assignments.
 */
export function buildGuardFromType(state: TransformState, file: ts.SourceFile, type: ts.Type): ts.Expression {
	const typeChecker = state.typeChecker;
	const diagnosticsLocation = getDeclarationOfType(type) ?? file;
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	if (type.isUnion()) {
		return buildUnionGuard(state, file, type);
	}

	if (isInstanceType(type)) {
		const instanceType = getInstanceTypeFromType(file, type);
		const additionalGuards = new Array<ts.PropertyAssignment>();

		for (const property of type.getProperties()) {
			const propertyType = type.checker.getTypeOfPropertyOfType(type, property.name);
			if (propertyType && !instanceType.getProperty(property.name)) {
				// assume intersections are children
				additionalGuards.push(
					f.propertyAssignmentDeclaration(property.name, buildGuardFromType(state, file, propertyType)),
				);
			}
		}

		const baseGuard = f.call(f.field(tId, "instanceIsA"), [instanceType.symbol.name]);
		return additionalGuards.length === 0
			? baseGuard
			: f.call(f.field(tId, "intersection"), [
					baseGuard,
					f.call(f.field(tId, "children"), [f.object(additionalGuards)]),
			  ]);
	}

	if (type.isIntersection()) {
		return buildIntersectionGuard(state, file, type);
	}

	if (isConditionalType(type)) {
		return f.call(f.field(tId, "union"), [
			buildGuardFromType(state, file, type.resolvedTrueType!),
			buildGuardFromType(state, file, type.resolvedFalseType!),
		]);
	}

	if ((type.flags & ts.TypeFlags.TypeVariable) !== 0) {
		const constraint = type.checker.getBaseConstraintOfType(type);
		if (!constraint) Diagnostics.error(diagnosticsLocation, "could not find constraint of type parameter");

		return buildGuardFromType(state, file, constraint);
	}

	if (type.isStringLiteral() || type.isNumberLiteral()) {
		return f.call(f.field(tId, "literal"), [type.value]);
	}

	if (typeChecker.isTupleType(type)) {
		const typeArgs = (type as ts.TypeReference).resolvedTypeArguments ?? [];
		return f.call(
			f.field(tId, "strictArray"),
			typeArgs.map((x) => buildGuardFromType(state, file, x)),
		);
	}

	if (typeChecker.isArrayType(type)) {
		const typeArg = (type as ts.GenericType).typeArguments?.[0];
		return f.call(f.field(tId, "array"), [
			typeArg ? buildGuardFromType(state, file, typeArg) : f.field(tId, "any"),
		]);
	}

	if (type.getCallSignatures().length > 0) {
		return f.field(tId, "callback");
	}

	const voidType = typeChecker.getVoidType();
	const undefinedType = typeChecker.getUndefinedType();
	if (type === voidType || type === undefinedType) {
		return f.field(tId, "none");
	}

	const anyType = typeChecker.getAnyType();
	if (type === anyType) {
		return f.field(tId, "any");
	}

	const trueType = typeChecker.getTrueType();
	if (type === trueType) {
		return f.call(f.field(tId, "literal"), [true]);
	}

	const falseType = typeChecker.getFalseType();
	if (type === falseType) {
		return f.call(f.field(tId, "literal"), [false]);
	}

	const stringType = typeChecker.getStringType();
	if (type === stringType) {
		return f.field(tId, "string");
	}

	const numberType = typeChecker.getNumberType();
	if (type === numberType) {
		return f.field(tId, "number");
	}

	if ((type.flags & ts.TypeFlags.Unknown) !== 0) {
		return f.call(f.field(tId, "union"), [f.field(tId, "any"), f.field(tId, "none")]);
	}

	const symbol = type.getSymbol();
	if (!symbol) Diagnostics.error(diagnosticsLocation, "Attribute type has no symbol");

	const enumType = type.checker.resolveName("Enum", undefined, ts.SymbolFlags.Type, false);
	if (symbol.parent?.parent && type.checker.getMergedSymbol(symbol.parent.parent) === enumType) {
		return f.call(f.field(tId, "literal"), [f.field(f.field("Enum", symbol.parent.name), symbol.name)]);
	}

	const mapSymbol = typeChecker.resolveName("Map", undefined, ts.SymbolFlags.Type, false);
	const readonlyMapSymbol = typeChecker.resolveName("ReadonlyMap", undefined, ts.SymbolFlags.Type, false);
	const weakMapSymbol = typeChecker.resolveName("WeakMap", undefined, ts.SymbolFlags.Type, false);
	if (symbol === mapSymbol || symbol === readonlyMapSymbol || symbol === weakMapSymbol) {
		const keyType = (type as ts.GenericType).typeArguments?.[0];
		const valueType = (type as ts.GenericType).typeArguments?.[1];
		return f.call(f.field(tId, "map"), [
			keyType ? buildGuardFromType(state, file, keyType) : f.field(tId, "any"),
			valueType ? buildGuardFromType(state, file, valueType) : f.field(tId, "any"),
		]);
	}

	const setSymbol = typeChecker.resolveName("Set", undefined, ts.SymbolFlags.Type, false);
	const readonlySetSymbol = typeChecker.resolveName("ReadonlySet", undefined, ts.SymbolFlags.Type, false);
	if (symbol === setSymbol || symbol === readonlySetSymbol) {
		const valueType = (type as ts.GenericType).typeArguments?.[0];
		return f.call(f.field(tId, "set"), [
			valueType ? buildGuardFromType(state, file, valueType) : f.field(tId, "any"),
		]);
	}

	const promiseSymbol = typeChecker.resolveName("Promise", undefined, ts.SymbolFlags.Type, false);
	if (symbol === promiseSymbol) {
		return f.field("Promise", "is");
	}

	for (const guard of rbxTypes) {
		const guardSymbol = typeChecker.resolveName(guard, undefined, ts.SymbolFlags.Type, false);
		if (!guardSymbol) Diagnostics.error(diagnosticsLocation, `Could not find symbol for ${guard}`);

		if (symbol === guardSymbol) {
			return f.field(tId, guard);
		}
	}

	if (type.isClass()) {
		Diagnostics.error(diagnosticsLocation, "Invalid type: class");
	}

	const isObject = isObjectType(type);
	const indexInfos = type.checker.getIndexInfosOfType(type);
	if (isObject && type.getApparentProperties().length === 0 && indexInfos.length === 0) {
		return f.field(tId, "any");
	}

	if (isObject || type.isClassOrInterface()) {
		const guards = [];

		if (type.getApparentProperties().length > 0) {
			guards.push(f.call(f.field(tId, "interface"), [f.object(buildGuardsFromType(state, file, type, true))]));
		}

		const indexInfo = indexInfos[0];
		if (indexInfo) {
			if (indexInfos.length > 1) {
				Diagnostics.error(
					diagnosticsLocation,
					"Flamework cannot generate types with multiple index signatures.",
				);
			}

			guards.push(
				f.call(f.field(tId, "map"), [
					buildGuardFromType(state, file, indexInfo.keyType),
					buildGuardFromType(state, file, indexInfo.type),
				]),
			);
		}

		return guards.length > 1 ? f.call(f.field(tId, "intersection"), guards) : guards[0];
	}

	if (type.flags & ts.TypeFlags.Enum) {
		const declarations = type.symbol.declarations;
		if (!declarations || declarations.length != 1 || !f.is.enumDeclaration(declarations[0])) {
			Diagnostics.error(diagnosticsLocation, `Invalid enum: ${typeChecker.typeToString(type)}`);
		}

		const declaration = declarations[0];
		const memberValues = declaration.members.map((v) => {
			const constant = typeChecker.getConstantValue(v);
			if (constant === undefined)
				Diagnostics.error(
					diagnosticsLocation,
					`Cannot compute constant of enum: ${typeChecker.typeToString(type)}`,
				);

			return constant;
		});
		return f.call(f.field(tId, "literal"), memberValues);
	}

	Diagnostics.error(diagnosticsLocation, `Invalid type: ${typeChecker.typeToString(type)}`);
}

function buildUnionGuard(state: TransformState, file: ts.SourceFile, type: ts.UnionType) {
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	const boolType = type.checker.getBooleanType();
	if (type === boolType) {
		return f.field(tId, "boolean");
	}

	const { enums, types: simplifiedTypes } = simplifyUnion(type);
	const [isOptional, types] = extractTypes(type.checker, simplifiedTypes);
	const guards = types.map((type) => buildGuardFromType(state, file, type));
	guards.push(...enums.map((enumId) => f.call(f.field(tId, "enum"), [f.field("Enum", enumId)])));

	const union = guards.length > 1 ? f.call(f.field(tId, "union"), guards) : guards[0];
	if (!union) return f.field(tId, "none");

	return isOptional ? f.call(f.field(tId, "optional"), [union]) : union;
}

function buildIntersectionGuard(state: TransformState, file: ts.SourceFile, type: ts.IntersectionType) {
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	if (type.checker.getIndexInfosOfType(type).length > 1) {
		Diagnostics.error(
			getDeclarationOfType(type) ?? file,
			"Flamework cannot generate intersections with multiple index signatures.",
		);
	}

	const guards = type.types.map((x) => buildGuardFromType(state, file, x));
	return f.call(f.field(tId, "intersection"), guards);
}

function simplifyUnion(type: ts.UnionType) {
	const enumType = type.checker.resolveName("Enum", undefined, ts.SymbolFlags.Type, false);
	if (
		type.aliasSymbol &&
		type.aliasSymbol.parent &&
		type.checker.getMergedSymbol(type.aliasSymbol.parent) === enumType
	) {
		return { enums: [type.aliasSymbol.name], types: [] };
	}

	const currentTypes = type.types;
	const possibleEnums = new Map<ts.Symbol, Set<ts.Type>>();
	const enums = new Array<string>();
	const types = new Array<ts.Type>();

	for (const type of currentTypes) {
		// We do not need to generate symbol types as they don't exist in Lua.
		if (type.flags & ts.TypeFlags.ESSymbolLike) {
			continue;
		}

		if (!type.symbol || !type.symbol.parent) {
			types.push(type);
			continue;
		}

		const enumKind = type.symbol.parent;
		if (!enumKind || !enumKind.parent || type.checker.getMergedSymbol(enumKind.parent) !== enumType) {
			types.push(type);
			continue;
		}

		if (type.symbol === enumKind.exports?.get(type.symbol.escapedName)) {
			let enumValues = possibleEnums.get(enumKind);
			if (!enumValues) possibleEnums.set(enumKind, (enumValues = new Set()));

			enumValues.add(type);
		}
	}

	for (const [symbol, set] of possibleEnums) {
		// Add 1 to account for GetEnumItems()
		if (set.size + 1 === symbol.exports?.size) {
			enums.push(symbol.name);
		} else {
			types.push(...set);
		}
	}

	return { enums, types };
}

function extractTypes(typeChecker: ts.TypeChecker, types: ts.Type[]): [isOptional: boolean, types: ts.Type[]] {
	const undefinedtype = typeChecker.getUndefinedType();
	const voidType = typeChecker.getVoidType();

	return [
		types.some((type) => type === undefinedtype || type === voidType),
		types.filter((type) => type !== undefinedtype && type !== voidType),
	];
}

function isObjectType(type: ts.Type): type is ts.InterfaceType {
	return (type.flags & ts.TypeFlags.Object) !== 0;
}

function isInstanceType(type: ts.Type) {
	return type.getProperty("_nominal_Instance") !== undefined;
}

function isConditionalType(type: ts.Type): type is ts.ConditionalType {
	return (type.flags & ts.TypeFlags.Conditional) !== 0;
}
