import {} from "ts-expose-internals";
import ts from "typescript";
import path from "path";
import { transformFile } from "./transformations/transformFile";
import { TransformerConfig, TransformState } from "./classes/transformState";
import { Logger } from "./classes/logger";
import { viewFile } from "./information/viewFile";
import { f } from "./util/factory";
import chalk from "chalk";
import { PKG_VERSION } from "./classes/rojoResolver/constants";
import { emitTypescriptMismatch } from "./util/functions/emitTypescriptMismatch";

export default function (program: ts.Program, config?: TransformerConfig) {
	return (context: ts.TransformationContext): ((file: ts.SourceFile) => ts.Node) => {
		if (Logger.verbose) Logger.write("\n");
		f.setFactory(context.factory);

		const state = new TransformState(program, context, config ?? {});
		let hasCollectedInformation = false;

		const projectFlameworkVersion = state.buildInfo.getFlameworkVersion();
		if (projectFlameworkVersion !== PKG_VERSION) {
			Logger.writeLine(
				`${chalk.red("Project was compiled on different version of Flamework.")}`,
				`Please recompile by deleting the ${path.relative(state.currentDirectory, state.outDir)} directory`,
				`Current Flamework Version: ${chalk.yellow(PKG_VERSION)}`,
				`Previous Flamework Version: ${chalk.yellow(projectFlameworkVersion)}`,
			);
			process.exit(1);
		}

		return (file: ts.SourceFile) => {
			if (!ts.isSourceFile(file)) {
				emitTypescriptMismatch(state, chalk.red("Failed to load! TS version mismatch detected"));
			}

			if (state.config.noSemanticDiagnostics !== true) {
				const originalFile = ts.getParseTreeNode(file, ts.isSourceFile);
				if (originalFile) {
					const preEmitDiagnostics = ts.getPreEmitDiagnostics(program, originalFile);
					if (preEmitDiagnostics.some((x) => x.category === ts.DiagnosticCategory.Error)) {
						preEmitDiagnostics
							.filter(ts.isDiagnosticWithLocation)
							.forEach((diag) => context.addDiagnostic(diag));
						return file;
					}
				} else {
					const relativeName = path.relative(state.srcDir, file.fileName);
					Logger.warn(`Failed to validate '${relativeName}' due to lack of parse tree node.`);
				}
			}

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
