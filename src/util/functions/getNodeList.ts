import ts from "typescript";

export function getNodeList<T extends ts.Node>(statements: T | T[]): T[] {
	return Array.isArray(statements) ? statements : [statements];
}
