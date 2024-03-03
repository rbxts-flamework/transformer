import ts from "typescript";
import { DiagnosticError, Diagnostics } from "../../classes/diagnostics";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";
import { getDeclarationOfType } from "./getDeclarationOfType";
import { getInstanceTypeFromType } from "./getInstanceTypeFromType";
import assert from "assert";

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
	node: ts.Node,
	type: ts.Type,
	file = state.getSourceFile(node),
	isInterfaceType = false,
): ts.PropertyAssignment[] {
	const generator = createGuardGenerator(state, file, node);
	return generator.buildGuardsFromType(type, isInterfaceType);
}

// This compiles directly to `t.typeof` for any userdata that `t` does not have an alias for, or users might not have yet.
const RBX_TYPES_NEW = ["buffer"];

const RBX_TYPES = [
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
	"Font",
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
	"FloatCurveKey",
	"OverlapParams",
	"thread",
	...RBX_TYPES_NEW,
] as const;

/**
 * Convert a type into a type guard.
 * @param state The TransformState
 * @param file The file that this type belongs to
 * @param type The type to convert
 * @returns An array of property assignments.
 */
export function buildGuardFromType(
	state: TransformState,
	node: ts.Node,
	type: ts.Type,
	file = state.getSourceFile(node),
): ts.Expression {
	const generator = createGuardGenerator(state, file, node);
	return generator.buildGuard(type);
}

/**
 * Creates a stateful guard generator.
 */
export function createGuardGenerator(state: TransformState, file: ts.SourceFile, diagnosticNode: ts.Node) {
	const tracking = new Array<[ts.Node, ts.Type]>();
	return { buildGuard, buildGuardsFromType };

	function fail(err: string): never {
		const basicDiagnostic = Diagnostics.createDiagnostic(diagnosticNode, ts.DiagnosticCategory.Error, err);
		let previousType: ts.Type | undefined;
		for (const location of tracking) {
			if (location[1] === previousType) {
				continue;
			}

			previousType = location[1];
			ts.addRelatedInfo(
				basicDiagnostic,
				Diagnostics.createDiagnostic(
					f.is.namedDeclaration(location[0]) ? location[0].name : location[0],
					ts.DiagnosticCategory.Error,
					`Type was defined here: ${state.typeChecker.typeToString(location[1])}`,
				),
			);
		}
		throw new DiagnosticError(basicDiagnostic);
	}

	function buildGuard(type: ts.Type): ts.Expression {
		const declaration = getDeclarationOfType(type);
		if (declaration) {
			tracking.push([declaration, type]);
		}

		const guard = buildGuardInner(type);

		if (declaration) {
			assert(tracking.pop()?.[0] === declaration, "Popped value was not expected");
		}

		return guard;
	}

	function buildGuardInner(type: ts.Type): ts.Expression {
		const typeChecker = state.typeChecker;
		const tId = state.addFileImport(file, "@rbxts/t", "t");

		if (type.isUnion()) {
			return buildUnionGuard(type);
		}

		if (isInstanceType(type)) {
			const instanceType = getInstanceTypeFromType(file, type);
			const additionalGuards = new Array<ts.PropertyAssignment>();

			for (const property of type.getProperties()) {
				const propertyType = type.checker.getTypeOfPropertyOfType(type, property.name);
				if (propertyType && !instanceType.getProperty(property.name)) {
					// assume intersections are children
					additionalGuards.push(f.propertyAssignmentDeclaration(property.name, buildGuard(propertyType)));
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
			return buildIntersectionGuard(type);
		}

		if (isConditionalType(type)) {
			return f.call(f.field(tId, "union"), [
				buildGuard(type.resolvedTrueType!),
				buildGuard(type.resolvedFalseType!),
			]);
		}

		if ((type.flags & ts.TypeFlags.TypeVariable) !== 0) {
			const constraint = type.checker.getBaseConstraintOfType(type);
			if (!constraint) fail("could not find constraint of type parameter");

			return buildGuard(constraint);
		}

		const literals = getLiteral(type);
		if (literals) {
			return f.call(f.field(tId, "literal"), literals);
		}

		if (typeChecker.isTupleType(type)) {
			const typeArgs = (type as ts.TypeReference).resolvedTypeArguments ?? [];
			return f.call(
				f.field(tId, "strictArray"),
				typeArgs.map((x) => buildGuard(x)),
			);
		}

		if (typeChecker.isArrayType(type)) {
			const typeArg = (type as ts.GenericType).typeArguments?.[0];
			return f.call(f.field(tId, "array"), [typeArg ? buildGuard(typeArg) : f.field(tId, "any")]);
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

		if (type.flags & ts.TypeFlags.TemplateLiteral) {
			fail(`Flamework encountered a template literal which is unsupported: ${type.checker.typeToString(type)}`);
		}

		const symbol = type.getSymbol();
		if (!symbol) {
			fail(`An unknown type was encountered with no symbol: ${typeChecker.typeToString(type)}`);
		}

		const mapSymbol = typeChecker.resolveName("Map", undefined, ts.SymbolFlags.Type, false);
		const readonlyMapSymbol = typeChecker.resolveName("ReadonlyMap", undefined, ts.SymbolFlags.Type, false);
		const weakMapSymbol = typeChecker.resolveName("WeakMap", undefined, ts.SymbolFlags.Type, false);
		if (symbol === mapSymbol || symbol === readonlyMapSymbol || symbol === weakMapSymbol) {
			const keyType = (type as ts.GenericType).typeArguments?.[0];
			const valueType = (type as ts.GenericType).typeArguments?.[1];
			return f.call(f.field(tId, "map"), [
				keyType ? buildGuard(keyType) : f.field(tId, "any"),
				valueType ? buildGuard(valueType) : f.field(tId, "any"),
			]);
		}

		const setSymbol = typeChecker.resolveName("Set", undefined, ts.SymbolFlags.Type, false);
		const readonlySetSymbol = typeChecker.resolveName("ReadonlySet", undefined, ts.SymbolFlags.Type, false);
		if (symbol === setSymbol || symbol === readonlySetSymbol) {
			const valueType = (type as ts.GenericType).typeArguments?.[0];
			return f.call(f.field(tId, "set"), [valueType ? buildGuard(valueType) : f.field(tId, "any")]);
		}

		const promiseSymbol = typeChecker.resolveName("Promise", undefined, ts.SymbolFlags.Type, false);
		if (symbol === promiseSymbol) {
			return f.field("Promise", "is");
		}

		for (const guard of RBX_TYPES) {
			const guardSymbol = typeChecker.resolveName(guard, undefined, ts.SymbolFlags.Type, false);
			if (!guardSymbol && symbol.name === guard) {
				fail(`Could not find symbol for ${guard}`);
			}

			if (symbol === guardSymbol) {
				if (RBX_TYPES_NEW.includes(guard)) {
					return f.call(f.field(tId, "typeof"), [guard]);
				} else {
					return f.field(tId, guard);
				}
			}
		}

		if (type.isClass()) {
			fail(
				`Class "${type.symbol.name}" was encountered. Flamework does not support generating guards for classes.`,
			);
		}

		const isObject = isObjectType(type);
		const indexInfos = type.checker.getIndexInfosOfType(type);
		if (isObject && type.getApparentProperties().length === 0 && indexInfos.length === 0) {
			return f.field(tId, "any");
		}

		if (isObject || type.isClassOrInterface()) {
			const guards = [];

			if (type.getApparentProperties().length > 0) {
				guards.push(f.call(f.field(tId, "interface"), [f.object(buildGuardsFromType(type, true))]));
			}

			const indexInfo = indexInfos[0];
			if (indexInfo) {
				if (indexInfos.length > 1) {
					fail("Flamework cannot generate types with multiple index signatures.");
				}

				guards.push(f.call(f.field(tId, "map"), [buildGuard(indexInfo.keyType), buildGuard(indexInfo.type)]));
			}

			return guards.length > 1 ? f.call(f.field(tId, "intersection"), guards) : guards[0];
		}

		// Elaboration error
		if (type.flags & ts.TypeFlags.UniqueESSymbol) {
			fail(
				`A "unique symbol" type was encountered. Did you accidentally include a boxed type such as String, Number or Boolean?`,
			);
		}

		fail(`An unknown type was encountered: ${typeChecker.typeToString(type)}`);
	}

	function buildUnionGuard(type: ts.UnionType) {
		const tId = state.addFileImport(file, "@rbxts/t", "t");

		const boolType = type.checker.getBooleanType();
		if (type === boolType) {
			return f.field(tId, "boolean");
		}

		const { enums, literals, types: simplifiedTypes } = simplifyUnion(type);
		const [isOptional, types] = extractTypes(type.checker, simplifiedTypes);
		const guards = types.map((type) => buildGuard(type));
		guards.push(...enums.map((enumId) => f.call(f.field(tId, "enum"), [f.field("Enum", enumId)])));

		if (literals.length > 0) {
			guards.push(f.call(f.field(tId, "literal"), literals));
		}

		const union = guards.length > 1 ? f.call(f.field(tId, "union"), guards) : guards[0];
		if (!union) return f.field(tId, "none");

		return isOptional ? f.call(f.field(tId, "optional"), [union]) : union;
	}

	function buildIntersectionGuard(type: ts.IntersectionType) {
		const tId = state.addFileImport(file, "@rbxts/t", "t");

		if (type.checker.getIndexInfosOfType(type).length > 1) {
			fail("Flamework cannot generate intersections with multiple index signatures.");
		}

		const guards = type.types.map(buildGuard);
		return f.call(f.field(tId, "intersection"), guards);
	}

	function buildGuardsFromType(type: ts.Type, isInterfaceType = false): ts.PropertyAssignment[] {
		const typeChecker = state.typeChecker;

		const declaration = getDeclarationOfType(type);
		if (declaration) {
			tracking.push([declaration, type]);
		}

		const guards = new Array<ts.PropertyAssignment>();
		for (const property of type.getProperties()) {
			const declaration = property.valueDeclaration;
			const propertyType = typeChecker.getTypeOfPropertyOfType(type, property.name);
			if (!propertyType) fail("Could not find type for field");

			if (isInterfaceType && (propertyType.flags & ts.TypeFlags.Unknown) !== 0) {
				continue;
			}

			if (declaration) {
				tracking.push([declaration, propertyType]);
			}

			const attribute = buildGuard(propertyType);
			guards.push(f.propertyAssignmentDeclaration(property.name, attribute));

			if (declaration) {
				assert(tracking.pop()?.[0] === declaration, "Popped value was not expected");
			}
		}

		if (declaration) {
			assert(tracking.pop()?.[0] === declaration, "Popped value was not expected");
		}

		return guards;
	}
}

function simplifyUnion(type: ts.UnionType) {
	const enumType = type.checker.resolveName("Enum", undefined, ts.SymbolFlags.Type, false);
	if (
		type.aliasSymbol &&
		type.aliasSymbol.parent &&
		type.checker.getMergedSymbol(type.aliasSymbol.parent) === enumType
	) {
		return { enums: [type.aliasSymbol.name], types: [], literals: [] };
	}

	const currentTypes = type.types;
	const possibleEnums = new Map<ts.Symbol, Set<ts.Type>>();
	const enums = new Array<string>();
	const types = new Array<ts.Type>();
	const literals = new Array<ts.Expression>();
	const isBoolean = currentTypes.filter((v) => v.flags & ts.TypeFlags.BooleanLiteral).length === 2;

	if (isBoolean) {
		types.push(type.checker.getBooleanType());
	}

	for (const type of currentTypes) {
		// We do not need to generate symbol types as they don't exist in Lua.
		if (type.flags & ts.TypeFlags.ESSymbolLike) {
			continue;
		}

		// This is a full `boolean`, so we can skip the individual literals.
		if (isBoolean && type.flags & ts.TypeFlags.BooleanLiteral) {
			continue;
		}

		const literal = getLiteral(type, true);
		if (literal) {
			literals.push(...literal);
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
			for (const type of set) {
				literals.push(f.field(f.field("Enum", symbol.name), type.symbol.name));
			}
		}
	}

	return { enums, types, literals };
}

function extractTypes(typeChecker: ts.TypeChecker, types: ts.Type[]): [isOptional: boolean, types: ts.Type[]] {
	const undefinedtype = typeChecker.getUndefinedType();
	const voidType = typeChecker.getVoidType();

	return [
		types.some((type) => type === undefinedtype || type === voidType),
		types.filter((type) => type !== undefinedtype && type !== voidType),
	];
}

function getLiteral(type: ts.Type, withoutEnums = false): ts.Expression[] | undefined {
	if (type.isStringLiteral() || type.isNumberLiteral()) {
		return [typeof type.value === "string" ? f.string(type.value) : f.number(type.value)];
	}

	const trueType = type.checker.getTrueType();
	if (type === trueType) {
		return [f.bool(true)];
	}

	const falseType = type.checker.getFalseType();
	if (type === falseType) {
		return [f.bool(false)];
	}

	if (type.flags & ts.TypeFlags.Enum) {
		const declarations = type.symbol.declarations;
		if (!declarations || declarations.length != 1 || !f.is.enumDeclaration(declarations[0])) return;

		const declaration = declarations[0];
		const memberValues = new Array<ts.Expression>();

		for (const member of declaration.members) {
			const constant = type.checker.getConstantValue(member);
			if (constant === undefined) return;

			memberValues.push(typeof constant === "string" ? f.string(constant) : f.number(constant));
		}

		return memberValues;
	}

	if (!withoutEnums) {
		const symbol = type.getSymbol();
		if (!symbol) return;

		const enumType = type.checker.resolveName("Enum", undefined, ts.SymbolFlags.Type, false);
		if (symbol.parent?.parent && type.checker.getMergedSymbol(symbol.parent.parent) === enumType) {
			return [f.field(f.field("Enum", symbol.parent.name), symbol.name)];
		}
	}
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
