import ts from "typescript";
import path from "path";
import normalize from "normalize-package-data";
import { isPathDescendantOf } from "./isPathDescendantOf";
import { Cache } from "../cache";

export type PackageJsonResult = ReturnType<typeof getPackageJsonInner>;

/**
 * Looks recursively at ancestors until a package.json is found
 * @param directory The directory to start under.
 */
export function getPackageJson(directory: string) {
	const existing = Cache.pkgJsonCache.get(path.normalize(directory));
	if (existing) return existing;

	const result = getPackageJsonInner(directory);

	Cache.pkgJsonCache.set(path.normalize(directory), result);
	ts.forEachAncestorDirectory(directory, (dir) => {
		if (isPathDescendantOf(dir, result.directory)) {
			Cache.pkgJsonCache.set(path.normalize(dir), result);
		} else {
			return true;
		}
	});

	return result;
}

function getPackageJsonInner(directory: string) {
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
