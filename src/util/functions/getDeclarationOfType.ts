import ts from "typescript";

export function getDeclarationOfType(type: ts.Type) {
	return type.symbol?.declarations?.[0];
}
