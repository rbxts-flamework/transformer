import path from "path";

/**
 * Checks if the `filePath` path is a descendant of the `dirPath` path.
 * @param filePath A path to a file.
 * @param dirPath A path to a directory.
 */
export function isPathDescendantOf(filePath: string, dirPath: string) {
	return dirPath === filePath || !path.relative(dirPath, filePath).startsWith("..");
}

/**
 * Checks if the `filePath` is a descendant of any of the specified `dirPaths` paths.
 * @param filePath A path to a file.
 * @param dirPaths The directories to check.
 */
export function isPathDescendantOfAny(filePath: string, dirPaths: string[]) {
	return dirPaths.some((dirPath) => isPathDescendantOf(filePath, dirPath));
}
