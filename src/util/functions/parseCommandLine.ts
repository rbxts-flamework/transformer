import ts from "typescript";
import path from "path";
import fs from "fs";

interface CommandLine {
	tsconfigPath: string;
	project: string;
}

function findTsConfigPath(projectPath: string) {
	let tsConfigPath: string | undefined = path.resolve(projectPath);
	if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
		tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new Error("Unable to find tsconfig.json!");
		}
	}
	return path.resolve(process.cwd(), tsConfigPath);
}

export function parseCommandLine(): CommandLine {
	const options = {} as CommandLine;

	const projectIndex = process.argv.findIndex((x) => x === "-p" || x === "--project");
	if (projectIndex !== -1) {
		options.tsconfigPath = findTsConfigPath(process.argv[projectIndex + 1]);
	} else {
		options.tsconfigPath = findTsConfigPath(".");
	}

	options.project = path.dirname(options.tsconfigPath);
	return options;
}
