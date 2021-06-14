import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";

/**
 * Convert a type into a list of typeguards.
 * @param tId An import symbol for @rbxts/t
 * @param type The type to convert
 * @returns An array of property assignments.
 */
export function buildGuardsFromType(
	state: TransformState,
	file: ts.SourceFile,
	type: ts.Type,
): ts.PropertyAssignment[] {
	const typeChecker = state.typeChecker;

	const guards = new Array<ts.PropertyAssignment>();
	for (const property of type.getProperties()) {
		const propertyType = typeChecker.getTypeOfPropertyOfType(type, property.name);
		if (!propertyType) Diagnostics.error(file, "Could not find type for field");

		const attribute = buildGuardFromType(state, file, propertyType);
		guards.push(f.propertyDeclaration(property.name, attribute));
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
	"PathWaypoint",
	"EnumItem",
	"RBXScriptSignal",
	"RBXScriptConnection",
	"thread",
] as const;

/**
 * Convert a type into a type guard.
 * @param tId An import symbol for rbxts/t
 * @param type The type to convert
 * @returns An array of property assignments.
 */
export function buildGuardFromType(state: TransformState, file: ts.SourceFile, type: ts.Type): ts.Expression {
	const typeChecker = state.typeChecker;
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	if (type.isUnion()) {
		return buildUnionGuard(state, file, type);
	}

	if (type.isIntersection()) {
		return buildIntersectionGuard(state, file, type);
	}

	if (type.isStringLiteral() || type.isNumberLiteral()) {
		return f.call(f.field(tId, "literal"), [type.value]);
	}

	if (isInstanceType(type) && type.symbol) {
		return f.call(f.field(tId, "instanceIsA"), [type.symbol.name]);
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

	const falseType = typeChecker.getTrueType();
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

	const boolType = typeChecker.getBooleanType();
	if (type === boolType) {
		return f.field(tId, "bool");
	}

	const symbol = type.getSymbol();
	if (!symbol) Diagnostics.error(file, "Attribute type has no symbol");

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
		if (!guardSymbol) Diagnostics.error(file, `Could not find symbol for ${guard}`);

		if (symbol === guardSymbol) {
			return f.field(tId, guard);
		}
	}

	if (type.isClass()) {
		Diagnostics.error(file, "Invalid type: class");
	}

	if (isObjectType(type)) {
		return f.call(f.field(tId, "interface"), [f.object(buildGuardsFromType(state, file, type))]);
	}

	Diagnostics.error(file, `Invalid type: ${typeChecker.typeToString(type)}`);
}

function buildUnionGuard(state: TransformState, file: ts.SourceFile, type: ts.UnionType) {
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	const enumType = type.checker.resolveName("Enum", undefined, ts.SymbolFlags.Type, false);
	if (type.aliasSymbol && type.aliasSymbol.parent === enumType) {
		return f.call(f.field(tId, "enum"), [f.field("Enum", type.aliasSymbol.name)]);
	}

	const undefinedType = type.checker.getUndefinedType();
	const voidType = type.checker.getVoidType();
	const isOptional = type.types.some((x) => x === undefinedType || x === voidType);
	const guards = type.types
		.filter((x) => x !== undefinedType && x !== voidType)
		.map((type) => buildGuardFromType(state, file, type));

	const union = guards.length > 1 ? f.call(f.field(tId, "union"), guards) : guards[0];
	if (!union) return f.field(tId, "none");

	return isOptional ? f.call(f.field(tId, "optional"), [union]) : union;
}

function buildIntersectionGuard(state: TransformState, file: ts.SourceFile, type: ts.IntersectionType) {
	const tId = state.addFileImport(file, "@rbxts/t", "t");

	const hasInstance = type.types.some((x) => isInstanceType(x));
	if (hasInstance) {
		const guards = type.types.map((x) => {
			if (isObjectType(x) && !isInstanceType(x)) {
				return f.call(f.field(tId, "children"), [f.object(buildGuardsFromType(state, file, x))]);
			}
			return buildGuardFromType(state, file, x);
		});
		return f.call(f.field(tId, "intersection"), guards);
	} else {
		const guards = type.types.map((x) => buildGuardFromType(state, file, x));
		return f.call(f.field(tId, "intersection"), guards);
	}
}

// TODO: change this to exclude isClassOrInterface() to make buildIntersectionGuard more robust
function isObjectType(type: ts.Type): type is ts.InterfaceType {
	return type.isClassOrInterface() || (type.flags & ts.TypeFlags.Object) !== 0;
}

function isInstanceType(type: ts.Type) {
	return type.getProperties().some((x) => x.name === "_nominal_Instance");
}
