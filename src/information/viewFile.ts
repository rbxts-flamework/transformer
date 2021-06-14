import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { viewNode } from "./viewNode";

export function viewFile(state: TransformState, file: ts.SourceFile) {
	function visitor(node: ts.Node) {
		viewNode(state, node);
		ts.forEachChild(node, visitor);
	}
	ts.forEachChild(file, visitor);

	for (const diag of Diagnostics.flush()) {
		state.addDiagnostic(diag);
	}
}
