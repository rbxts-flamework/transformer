import path from "path";
import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { f } from "./factory";
import { getDeclarationName } from "./functions/getDeclarationName";
import { getPackageJson } from "./functions/getPackageJson";
import { isDefinedType } from "./functions/isDefinedType";
import { isPathDescendantOfAny } from "./functions/isPathDescendantOf";

/**
 * Format the internal id to be shorter, remove `out` part of path, and use hashPrefix.
 */
function formatInternalid(state: TransformState, internalId: string, hashPrefix = state.config.hashPrefix) {
	const match = new RegExp(`^.*:(.*)@(.+)$`).exec(internalId);
	if (!match) return internalId;

	const [, path, name] = match;
	const revisedPath = path.replace(/^(.*?)[\/\\]/, "");
	return hashPrefix ? `${hashPrefix}:${revisedPath}@${name}` : `${revisedPath}@${name}`;
}

/**
 * Gets the short ID for a node and includes the hash for uniqueness.
 */
function getShortId(state: TransformState, node: ts.Declaration, hashPrefix = state.config.hashPrefix) {
	const hash = state.hash(state.buildInfo.getLatestId(), true);
	const fullName = getDeclarationName(node);
	const fileName = path.parse(node.getSourceFile().fileName).name;
	const luaFileName = fileName === "index" ? "init" : fileName;
	const isShort = state.config.idGenerationMode === "short";
	const shortId = `${isShort ? luaFileName + "@" : ""}${fullName}{${hash}}`;
	return hashPrefix ? `${state.config.hashPrefix}:${shortId}` : shortId;
}

export function getInternalId(state: TransformState, node: ts.NamedDeclaration) {
	const filePath = state.getSourceFile(node).fileName;
	const fullName = getDeclarationName(node);
	const { directory, result } = getPackageJson(path.dirname(filePath));

	if (isPathDescendantOfAny(filePath, state.rootDirs)) {
		const outputPath = state.pathTranslator.getOutputPath(filePath).replace(/(\.lua|\.d\.ts)$/, "");
		const relativePath = path.relative(state.currentDirectory, outputPath);
		const internalId = `${result.name}:${relativePath.replace(/\\/g, "/")}@${fullName}`;
		return {
			isPackage: false,
			internalId,
		};
	}

	const relativePath = path.relative(directory, filePath.replace(/(\.d)?.ts$/, "").replace(/index$/, "init"));
	const internalId = `${result.name}:${relativePath.replace(/\\/g, "/")}@${fullName}`;
	return {
		isPackage: true,
		internalId,
	};
}

export function getDeclarationUid(state: TransformState, node: ts.NamedDeclaration) {
	const { isPackage, internalId } = getInternalId(state, node);
	const id = state.buildInfo.getIdentifierFromInternal(internalId);
	if (id) return id;

	// this is a package, and the package itself did not generate an id
	// use the internal ID to prevent breakage between packages and games.
	if (isPackage) {
		const buildInfo = state.buildInfo.getBuildInfoFromFile(state.getSourceFile(node).fileName);
		if (buildInfo) {
			const prefix = buildInfo.getIdentifierPrefix();
			if (prefix) {
				return formatInternalid(state, internalId, prefix);
			}
		}
		return internalId;
	}

	let newId: string;
	if (state.config.idGenerationMode === "obfuscated") {
		newId = state.hash(state.buildInfo.getLatestId());
	} else if (state.config.idGenerationMode === "short" || state.config.idGenerationMode === "tiny") {
		newId = getShortId(state, node);
	} else {
		newId = formatInternalid(state, internalId);
	}

	state.buildInfo.addIdentifier(internalId, newId);
	return newId;
}

export function getSymbolUid(state: TransformState, symbol: ts.Symbol, trace: ts.Node): string;
export function getSymbolUid(state: TransformState, symbol: ts.Symbol, trace?: ts.Node): string | undefined;
export function getSymbolUid(state: TransformState, symbol: ts.Symbol, trace?: ts.Node) {
	if (symbol.valueDeclaration) {
		return getDeclarationUid(state, symbol.valueDeclaration);
	} else if (symbol.declarations?.[0]) {
		return getDeclarationUid(state, symbol.declarations[0]);
	} else if (trace) {
		Diagnostics.error(trace, `Could not find UID for symbol "${symbol.name}"`);
	}
}

export function getTypeUid(state: TransformState, type: ts.Type, trace: ts.Node): string;
export function getTypeUid(state: TransformState, type: ts.Type, trace?: ts.Node): string | undefined;
export function getTypeUid(state: TransformState, type: ts.Type, trace?: ts.Node) {
	if (type.symbol) {
		return getSymbolUid(state, type.symbol, trace);
	} else if (isDefinedType(type)) {
		return `$p:defined`;
	} else if (type.flags & ts.TypeFlags.Intrinsic) {
		return `$p:${(type as ts.IntrinsicType).intrinsicName}`;
	} else if (type.flags & ts.TypeFlags.NumberLiteral) {
		return `$pn:${(type as ts.NumberLiteralType).value}`;
	} else if (type.flags & ts.TypeFlags.StringLiteral) {
		return `$ps:${(type as ts.StringLiteralType).value}`;
	} else if (trace) {
		Diagnostics.error(trace, `Could not find UID for type "${type.checker.typeToString(type)}"`);
	}
}

export function getNodeUid(state: TransformState, node: ts.Node): string {
	if (f.is.namedDeclaration(node)) {
		return getDeclarationUid(state, node);
	}

	// resolve type aliases to the alias declaration
	if (f.is.referenceType(node)) {
		return getNodeUid(state, node.typeName);
	} else if (f.is.queryType(node)) {
		return getNodeUid(state, node.exprName);
	}

	const symbol = state.getSymbol(node);
	if (symbol) {
		return getSymbolUid(state, symbol, node);
	}

	const type = state.typeChecker.getTypeAtLocation(node);
	return getTypeUid(state, type, node);
}
