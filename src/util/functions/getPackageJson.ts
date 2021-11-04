import ts from "typescript";
import path from "path";
import normalize from "normalize-package-data";

/**
 * Looks recursively at ancestors until a package.json is found
 * @param directory The directory to start under.
 */
export function getPackageJson(directory: string) {
	const packageJsonPath = ts.findPackageJson(directory, ts.sys as never);
	if (!packageJsonPath) throw new Error(`package.json not found in ${directory}`);

	const text = packageJsonPath ? ts.sys.readFile(packageJsonPath) : undefined;
	const packageJson = text ? JSON.parse(text) : {};
	normalize(packageJson);

	return {
		directory: path.dirname(packageJsonPath),
		path: packageJsonPath,
		result: packageJson as normalize.Package,
	};
}
