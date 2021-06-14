import { RojoResolver } from "../classes/rojoResolver/rojoResolver";

export interface Cache {
	rojoSum?: string;
	rojoResolver?: RojoResolver;
	buildInfoCandidates?: string[];
	shouldView: Map<string, boolean>;
	realPath: Map<string, string>;
}

/**
 * Global cache that is only reset when rbxtsc is restarted.
 */
export const Cache: Cache = {
	shouldView: new Map(),
	realPath: new Map(),
};
