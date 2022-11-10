import ts from "typescript";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { PKG_VERSION } from "./pathTranslator/constants";
import { isPathDescendantOf } from "../util/functions/isPathDescendantOf";
import { FlameworkConfig } from "./transformState";
import { validateSchema } from "../util/schema";

interface BuildDecorator {
	name: string;
	internalId: string;
	isFlameworkDecorator: boolean;
}

interface BuildClass {
	filePath: string;
	internalId: string;
	decorators: Array<BuildDecorator>;
}

interface FlameworkMetadata {
	config?: FlameworkConfig;
}

export interface FlameworkBuildInfo {
	version: number;
	flameworkVersion: string;
	identifierPrefix?: string;
	salt?: string;
	metadata?: FlameworkMetadata;
	stringHashes?: { [key: string]: string };
	identifiers: { [key: string]: string };
	classes?: Array<BuildClass>;
}

export class BuildInfo {
	static fromPath(fileName: string) {
		if (!ts.sys.fileExists(fileName)) return new BuildInfo(fileName);

		const fileContents = ts.sys.readFile(fileName);
		if (!fileContents) throw new Error(`Could not read file ${fileName}`);

		const buildInfo = JSON.parse(fileContents);
		if (validateSchema("buildInfo", buildInfo)) {
			return new BuildInfo(fileName, buildInfo);
		}

		throw new Error(`Found invalid build info at ${fileName}`);
	}

	static fromDirectory(directory: string) {
		const buildInfoPath = path.join(directory, "flamework.build");
		if (ts.sys.fileExists(buildInfoPath)) {
			return this.fromPath(buildInfoPath);
		}

		const packageJsonPath = ts.findPackageJson(directory, ts.sys as never);
		if (packageJsonPath) {
			const buildInfoPath = path.join(path.dirname(packageJsonPath), "flamework.build");
			if (buildInfoPath && ts.sys.fileExists(buildInfoPath)) {
				return this.fromPath(buildInfoPath);
			}
		}
	}

	private static candidateCache = new Map<string, { result?: string }>();
	static findCandidateUpper(startDirectory: string, depth = 4): string | undefined {
		const cache = this.candidateCache.get(startDirectory);
		if (cache && cache.result) {
			return cache.result;
		}

		const buildPath = path.join(startDirectory, "flamework.build");
		if (!cache && fs.existsSync(buildPath)) {
			this.candidateCache.set(startDirectory, { result: buildPath });
			return buildPath;
		} else {
			this.candidateCache.set(startDirectory, {});
		}

		if (depth > 0) {
			return this.findCandidateUpper(path.dirname(startDirectory), depth - 1);
		}
	}

	static findCandidates(searchPath: string, depth = 2, isNodeModules = true): string[] {
		const candidates: string[] = [];

		for (const childPath of fs.readdirSync(searchPath)) {
			// only search @* (@rbxts, @flamework, @custom, etc)
			if (!isNodeModules || childPath.startsWith("@")) {
				const fullPath = path.join(searchPath, childPath);
				const realPath = fs.realpathSync(fullPath);
				if (fs.lstatSync(realPath).isDirectory() && depth !== 0) {
					candidates.push(...BuildInfo.findCandidates(fullPath, depth - 1, childPath === "node_modules"));
				} else {
					if (childPath === "flamework.build") {
						candidates.push(fullPath);
					}
				}
			}
		}

		return candidates;
	}

	private buildInfo: FlameworkBuildInfo;
	private buildInfos: BuildInfo[] = [];
	private identifiersLookup = new Map<string, string>();
	constructor(public buildInfoPath: string, buildInfo?: FlameworkBuildInfo) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		this.buildInfo = buildInfo ?? {
			version: 1,
			flameworkVersion: PKG_VERSION,
			identifiers: {},
		};
		if (buildInfo) {
			for (const [internalId, id] of Object.entries(buildInfo.identifiers)) {
				this.identifiersLookup.set(id, internalId);
			}
		}
	}

	/**
	 * Saves the build info to a file.
	 */
	save() {
		fs.writeFileSync(this.buildInfoPath, JSON.stringify(this.buildInfo, undefined, "\t"));
	}

	/**
	 * Retrieves the salt previously used to generate identifiers, or creates one.
	 */
	getSalt() {
		if (this.buildInfo.salt) return this.buildInfo.salt;

		const salt = crypto.randomBytes(64).toString("hex");
		this.buildInfo.salt = salt;

		return salt;
	}

	/**
	 * Retrieves the version of flamework that this project was originally compiled on.
	 */
	getFlameworkVersion() {
		return this.buildInfo.flameworkVersion;
	}

	/**
	 * Register a build info from an external source, normally packages.
	 * @param buildInfo The BuildInfo to add
	 */
	addBuildInfo(buildInfo: BuildInfo) {
		this.buildInfos.push(buildInfo);
	}

	/**
	 * Register a new identifier to be saved with the build info.
	 * @param internalId The internal, reproducible ID
	 * @param id The random or incremental ID
	 */
	addIdentifier(internalId: string, id: string) {
		const identifier = this.getIdentifierFromInternal(internalId);
		if (identifier) throw new Error(`Attempt to rewrite identifier ${internalId} -> ${id} (from ${identifier})`);

		this.buildInfo.identifiers[internalId] = id;
		this.identifiersLookup.set(id, internalId);
	}

	addBuildClass(classInfo: BuildClass) {
		if (this.getBuildClass(classInfo.internalId))
			throw new Error(`Attempt to overwrite ${classInfo.internalId} class`);

		if (!this.buildInfo.classes) this.buildInfo.classes = [];
		this.buildInfo.classes.push(classInfo);
	}

	getBuildInfoFromFile(fileName: string): BuildInfo | undefined {
		for (const build of this.buildInfos) {
			if (isPathDescendantOf(fileName, path.dirname(build.buildInfoPath))) {
				return build;
			}
		}
	}

	/**
	 * Sets metadata which will be exposed at runtime.
	 */
	setMetadata<K extends keyof FlameworkMetadata>(key: K, value: FlameworkMetadata[K]) {
		this.buildInfo.metadata ??= {};
		this.buildInfo.metadata[key] = value;
	}

	/**
	 * Gets metadata exposed at runtime.
	 */
	getMetadata<K extends keyof FlameworkMetadata>(key: K) {
		return this.buildInfo.metadata?.[key];
	}

	/**
	 * Retrieves all metadata of this build info and its children.
	 */
	getChildrenMetadata<K extends keyof FlameworkMetadata>(name: K) {
		const childrenMetadata = new Map<string, FlameworkMetadata[K]>();

		for (const build of this.buildInfos) {
			const key = build.getIdentifierPrefix();
			const metadata = build.getMetadata(name);
			if (!key) continue;
			if (!metadata) continue;

			childrenMetadata.set(key, metadata);

			for (const [key, metadata] of build.getChildrenMetadata(name)) {
				childrenMetadata.set(key, metadata);
			}
		}

		return childrenMetadata;
	}

	/**
	 * Sets configuration which will be exposed at runtime.
	 */
	setConfig(value: FlameworkConfig | undefined) {
		this.buildInfo.metadata ??= {};
		this.buildInfo.metadata.config = value;
	}

	/**
	 * Get the random or incremental Id from the internalId.
	 * @param internalId The internal, reproducible ID
	 */
	getIdentifierFromInternal(internalId: string): string | undefined {
		const id = this.buildInfo.identifiers[internalId];
		if (id) return id;

		for (const build of this.buildInfos) {
			const subId = build.getIdentifierFromInternal(internalId);
			if (subId) return subId;
		}
	}

	/**
	 * Get the internal, reproducible Id from a random Id.
	 * @param id The random or incremental Id
	 */
	getInternalFromIdentifier(id: string): string | undefined {
		const internalId = this.identifiersLookup.get(id);
		if (internalId) return internalId;

		for (const build of this.buildInfos) {
			const subId = build.getIdentifierFromInternal(id);
			if (subId) return subId;
		}
	}

	getBuildClass(internalId: string): BuildClass | undefined {
		const buildClass = this.buildInfo.classes?.find((x) => x.internalId === internalId);
		if (buildClass) return buildClass;

		for (const build of this.buildInfos) {
			const subClass = build.getBuildClass(internalId);
			if (subClass) return subClass;
		}
	}

	/**
	 * Returns the next Id for incremental generation.
	 */
	getLatestId() {
		return Object.keys(this.buildInfo.identifiers).length + 1;
	}

	/**
	 * Create a UUID, subsequent calls with the same string will have the same UUID.
	 * @param str The string to hash
	 */
	hashString(str: string, context = "@") {
		str = `${context}:${str}`;

		let stringHashes = this.buildInfo.stringHashes;
		if (!stringHashes) this.buildInfo.stringHashes = stringHashes = {};

		if (stringHashes[str]) return stringHashes[str];

		const strUuid = uuid();
		stringHashes[str] = strUuid;
		return strUuid;
	}

	/**
	 * Sets the prefix used for identifiers.
	 * Used to generate IDs for packages.
	 */
	setIdentifierPrefix(prefix: string | undefined) {
		this.buildInfo.identifierPrefix = prefix;
	}

	/**
	 * Gets the prefixed used for identifiers.
	 */
	getIdentifierPrefix() {
		return this.buildInfo.identifierPrefix;
	}
}
