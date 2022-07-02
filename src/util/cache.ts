import { RojoResolver } from "@roblox-ts/rojo-resolver";
import { PackageJsonResult } from "./functions/getPackageJson";

export interface Cache {
	rojoSum?: string;
	rojoResolver?: RojoResolver;
	buildInfoCandidates?: string[];
	isInitialCompile: boolean;
	shouldView: Map<string, boolean>;
	realPath: Map<string, string>;
	moduleResolution: Map<string, string | false>;
	pkgJsonCache: Map<string, PackageJsonResult>;
}

/**
 * Global cache that is only reset when rbxtsc is restarted.
 */
export const Cache: Cache = {
	isInitialCompile: true,
	shouldView: new Map(),
	realPath: new Map(),
	moduleResolution: new Map(),
	pkgJsonCache: new Map(),
};
