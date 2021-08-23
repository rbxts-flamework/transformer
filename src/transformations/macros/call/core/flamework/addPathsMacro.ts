import ts from "typescript";
import path from "path";
import { f } from "../../../../../util/factory";
import { CallMacro } from "../../../macro";
import { Diagnostics } from "../../../../../classes/diagnostics";
import { TransformState } from "../../../../../classes/transformState";
import glob from "glob";

function getPathFromSpecifier(state: TransformState, source: ts.SourceFile, hostDir: string, specifier: string) {
	const sourceDir = path.dirname(source.fileName);
	const absolutePath = specifier.startsWith(".") ? path.join(sourceDir, specifier) : path.join(hostDir, specifier);
	const outputPath = state.pathTranslator.getOutputPath(absolutePath);

	return state.rojoResolver?.getRbxPathFromFilePath(outputPath);
}

export const FlameworkAddPathsMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("addPaths");
	},

	transform(state, node) {
		if (!state.rojoResolver) Diagnostics.error(node, "addPaths was used but Rojo could not be resolved");

		const importId = state.addFileImport(state.getSourceFile(node), "@flamework/core", "Flamework");
		const convertedArguments: ts.Expression[] = [];

		for (const arg of node.arguments) {
			if (!f.is.string(arg)) Diagnostics.error(arg, `Expected string`);

			const paths = glob.sync(`${arg.text}/`, {
				root: state.currentDirectory,
				cwd: state.currentDirectory,
				nomount: true,
				nocase: true,
			});
			for (const path of paths) {
				const rbxPath = getPathFromSpecifier(state, state.getSourceFile(node), state.currentDirectory, path);
				if (!rbxPath) Diagnostics.error(arg, `Could not find rojo data`);

				convertedArguments.push(f.array(rbxPath.map(f.string)));
			}
		}

		return f.call(f.field(importId, "_addPaths"), convertedArguments);
	},
};
