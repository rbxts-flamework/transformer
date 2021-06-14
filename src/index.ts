import {} from "ts-expose-internals";
import ts from "typescript";
import { transformFile } from "./transformations/transformFile";
import { TransformerConfig, TransformState } from "./classes/transformState";
import { Logger } from "./classes/logger";
import { viewFile } from "./information/viewFile";
import { f } from "./util/factory";

export default function (program: ts.Program, config?: TransformerConfig) {
	return (context: ts.TransformationContext): ((file: ts.SourceFile) => ts.Node) => {
		Logger.write("\n");
		f.setFactory(context.factory);

		const state = new TransformState(program, context, config ?? {});
		let hasCollectedInformation = false;

		return (file: ts.SourceFile) => {
			if (!hasCollectedInformation) {
				hasCollectedInformation = true;

				state.symbolProvider.registerInterestingFiles();
				program.getSourceFiles().forEach((file) => {
					if (file.isDeclarationFile && !state.shouldViewFile(file)) return;

					viewFile(state, file);
				});

				state.setupMacros();
			}

			if (state.hasErrors) return file;

			const result = transformFile(state, file);
			return result;
		};
	};
}
