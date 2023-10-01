import { TransformState } from "../../../classes/transformState";
import path from "path";
import { f } from "../../../util/factory";
import ts from "typescript";
import { Diagnostics } from "../../../classes/diagnostics";

export function buildPathGlobIntrinsic(state: TransformState, node: ts.Node, pathType: ts.Type) {
	const file = state.getSourceFile(node);

	if (!pathType.isStringLiteral()) {
		Diagnostics.error(
			node,
			`Path is invalid, expected string literal and got: ${state.typeChecker.typeToString(pathType)}`,
		);
	}

	const glob = pathType.value;
	const absoluteGlob = glob.startsWith(".")
		? path.relative(state.rootDirectory, path.resolve(path.dirname(file.fileName), glob)).replace(/\\/g, "/")
		: glob;

	state.buildInfo.addGlob(absoluteGlob, state.getFileId(file));
	return f.string(state.obfuscateText(absoluteGlob, "addPaths"));
}

export function buildPathIntrinsic(state: TransformState, node: ts.Node, pathType: ts.Type) {
	if (!pathType.isStringLiteral()) {
		Diagnostics.error(
			node,
			`Path is invalid, expected string literal and got: ${state.typeChecker.typeToString(pathType)}`,
		);
	}

	const outputPath = state.pathTranslator.getOutputPath(pathType.value);
	const rbxPath = state.rojoResolver?.getRbxPathFromFilePath(outputPath);
	if (!rbxPath) {
		Diagnostics.error(node, `Could not find Rojo data for '${pathType.value}'`);
	}

	return f.array([f.array(rbxPath.map(f.string))]);
}
