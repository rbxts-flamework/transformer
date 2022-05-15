import path from "path";
import ts from "typescript";
import { PathTranslator } from "../../classes/rojoResolver/pathTranslator";
import { assert } from "../../classes/rojoResolver/util/assert";

function findAncestorDir(dirs: Array<string>) {
	dirs = dirs.map(path.normalize).map((v) => (v.endsWith(path.sep) ? v : v + path.sep));
	let currentDir = dirs[0];
	while (!dirs.every((v) => v.startsWith(currentDir))) {
		currentDir = path.join(currentDir, "..");
	}
	return currentDir;
}

function getRootDirs(compilerOptions: ts.CompilerOptions) {
	const rootDirs = compilerOptions.rootDir ? [compilerOptions.rootDir] : compilerOptions.rootDirs;
	if (!rootDirs) assert(false, "rootDir or rootDirs must be specified");

	return rootDirs;
}

export function createPathTranslator(program: ts.Program) {
	const compilerOptions = program.getCompilerOptions();
	const rootDir = findAncestorDir([program.getCommonSourceDirectory(), ...getRootDirs(compilerOptions)]);
	const outDir = compilerOptions.outDir!;
	return new PathTranslator(rootDir, outDir, undefined, compilerOptions.declaration || false);
}
