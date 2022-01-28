import path from "path";

export function arePathsEqual(path1: string, path2: string) {
	if (process.platform === "win32") {
		path1 = path1.toLowerCase();
		path2 = path2.toLowerCase();
	}
	return path.normalize(path1) === path.normalize(path2);
}
