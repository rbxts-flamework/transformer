import ts from "typescript";
import path from "path";
import { f } from "../../../util/factory";
import { CallMacro } from "../macro";
import { Logger } from "../../../classes/logger";
import { Diagnostics } from "../../../classes/diagnostics";

export const FlameworkAddPathsMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("addPaths");
	},

	transform(state, node) {
		if (!state.rojoResolver) Diagnostics.error(node, "addPaths was used but Rojo could not be resolved");

		const importId = state.addFileImport(state.getSourceFile(node), "@rbxts/flamework", "Flamework");
		const convertedArguments: ts.Expression[] = [];

		for (const arg of node.arguments) {
			if (f.is.string(arg)) {
				const rbxPath = state.rojoResolver.getRbxPathFromFilePath(
					state.pathTranslator.getOutputPath(path.join(state.currentDirectory, arg.text)),
				);
				if (rbxPath) {
					convertedArguments.push(f.array(rbxPath.map(f.string)));
					continue;
				}
			}

			Logger.error("Found invalid addPaths argument", arg.getText());
		}

		return f.call(f.field(importId, "_addPaths"), convertedArguments);
	},
};
