import fs from "fs";
import ts from "typescript";

export function isCleanBuildDirectory(compilerOptions: ts.CompilerOptions) {
	if (compilerOptions.incremental && compilerOptions.tsBuildInfoFile) {
		return !fs.existsSync(compilerOptions.tsBuildInfoFile);
	}

	return true;
}
