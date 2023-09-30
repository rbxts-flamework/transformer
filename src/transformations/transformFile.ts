import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";
import { TransformState } from "../classes/transformState";
import { f } from "../util/factory";
import { transformStatementList } from "./transformStatementList";

export function transformFile(state: TransformState, file: ts.SourceFile): ts.SourceFile {
	state.buildInfo.invalidateGlobs(state.getFileId(file));

	const statements = transformStatementList(state, file.statements);

	const hoisted = state.hoistedToTop.get(file);
	if (hoisted) {
		statements.unshift(...hoisted);
	}

	const imports = state.fileImports.get(file.fileName);
	if (imports) {
		statements.unshift(
			...imports.map((info) =>
				f.importDeclaration(
					info.path,
					info.entries.map((x) => [x.name, x.identifier]),
				),
			),
		);
	}

	for (const diag of Diagnostics.flush()) {
		state.addDiagnostic(diag);
	}

	const sourceFile = f.update.sourceFile(file, statements);

	return sourceFile;
}
