import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { f } from "../util/factory";
import { transformStatementList } from "./transformStatementList";

export function transformFile(state: TransformState, file: ts.SourceFile): ts.SourceFile {
	state.buildInfo.invalidateGlobs(state.getFileId(file));

	const statements = transformStatementList(state, file.statements);

	const imports = state.fileImports.get(file.fileName);
	if (imports) {
		const firstStatement = statements[0];

		statements.unshift(
			...imports.map((info) =>
				f.importDeclaration(
					info.path,
					info.entries.map((x) => [x.name, x.identifier]),
				),
			),
		);

		// steal comments from original first statement so that comment directives work properly
		if (firstStatement && statements[0]) {
			const original = ts.getParseTreeNode(firstStatement);

			ts.moveSyntheticComments(statements[0], firstStatement);

			if (original) {
				ts.copyComments(original, statements[0]);
				ts.removeAllComments(original);
			}
		}
	}

	for (const diag of Diagnostics.flush()) {
		state.addDiagnostic(diag);
	}

	const sourceFile = f.update.sourceFile(file, statements);

	return sourceFile;
}
