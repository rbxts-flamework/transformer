import ts from "typescript";
import { TransformState } from "../classes/transformState";
import { viewClassDeclaration } from "./statements/viewClassDeclaration";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VIEWERS = new Map<ts.SyntaxKind, (state: TransformState, node: any) => void>([
	[ts.SyntaxKind.ClassDeclaration, viewClassDeclaration],
]);

export function viewStatement(state: TransformState, expression: ts.Statement) {
	// do stuff
	const viewer = VIEWERS.get(expression.kind);
	if (viewer) {
		viewer(state, expression);
	}
}
