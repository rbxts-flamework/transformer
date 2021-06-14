import ts from "typescript";
import path from "path";

/**
 * Looks recursively at ancestors until a package.json is found
 * @param directory The directory to start under.
 */
export function getPackageJson(directory: string) {
	const packageJsonPath = ts.findPackageJson(directory, ts.sys as never);
	if (!packageJsonPath) throw new Error(`package.json not found in ${directory}`);

	const text = packageJsonPath ? ts.sys.readFile(packageJsonPath) : undefined;
	return {
		directory: path.dirname(packageJsonPath),
		path: packageJsonPath,
		result: text ? JSON.parse(text) : undefined,
	};
}
