import ts from "typescript";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import Hashids from "hashids";
import { transformNode } from "../transformations/transformNode";
import { Cache } from "../util/cache";
import { getPackageJson } from "../util/functions/getPackageJson";
import { BuildInfo } from "./buildInfo";
import { Logger } from "./logger";
import { SymbolProvider } from "./symbolProvider";
import { f } from "../util/factory";
import { isPathDescendantOf } from "../util/functions/isPathDescendantOf";
import { ClassInfo } from "../types/classes";
import { CallMacro } from "../transformations/macros/macro";
import { CALL_MACROS } from "../transformations/macros/call/callMacros";
import { isCleanBuildDirectory } from "../util/functions/isCleanBuildDirectory";
import { parseCommandLine } from "../util/functions/parseCommandLine";
import { createPathTranslator } from "../util/functions/createPathTranslator";
import { arePathsEqual } from "../util/functions/arePathsEqual";
import { GenericIdOptions } from "../util/functions/getGenericIdMap";
import { NodeMetadata } from "./nodeMetadata";
import { RbxPath, RojoResolver } from "@roblox-ts/rojo-resolver";
import { PathTranslator } from "./pathTranslator";
import { assert } from "../util/functions/assert";
import { getSchemaErrors, validateSchema } from "../util/schema";
import { shuffle } from "../util/functions/shuffle";
import glob from "glob";

const IGNORE_RBXTS_REGEX = /node_modules\/@rbxts\/(compiler-types|types)\/.*\.d\.ts$/;

/**
 * Runtime configuration exposed via `flamework.json`
 */
export interface FlameworkConfig {
	logLevel?: "none" | "verbose";
	profiling?: boolean;
	disableDependencyWarnings?: boolean;
}

export interface TransformerConfig {
	/**
	 * An internal option that should not be used.
	 * This is used to compile the framework package, turning this on in your game will cause many errors.
	 */
	$rbxpackmode$?: boolean;

	/**
	 * Disables TypeScript's own semantic diagnostics.
	 * Improves performance, but results in increased risk of incorrect compilation as well as messed up diagnostic spans.
	 */
	noSemanticDiagnostics?: boolean;

	/**
	 * This is the salt used for hashes generated by Flamework.
	 * Defaults to a randomly generated 64 byte salt.
	 */
	salt?: string;

	/**
	 * This can be used to lower collision chance with packages.
	 * Defaults to package name.
	 */
	hashPrefix?: string;

	/**
	 * Whether to automatically generate the identifiers for exports.
	 * This is recommended for packages but it is not recommended to
	 * enable this in games.
	 */
	preloadIds?: boolean;

	/**
	 * Whether to enable flamework's obfuscation.
	 *
	 * This comprises of:
	 * 1. random event names
	 * 2. shortened ids
	 */
	obfuscation?: boolean;

	/**
	 * Determines the id generation mode.
	 * Defaults to "full" and should only be configured in game projects.
	 */
	idGenerationMode?: "full" | "short" | "tiny" | "obfuscated";
}

export class TransformState {
	public parsedCommandLine = parseCommandLine();
	public currentDirectory = this.parsedCommandLine.project;
	public options = this.program.getCompilerOptions();
	public srcDir = this.options.rootDir ?? this.currentDirectory;
	public outDir = this.options.outDir ?? this.currentDirectory;
	public rootDirs = this.options.rootDirs ? this.options.rootDirs : [this.srcDir];
	public typeChecker = this.program.getTypeChecker();

	public symbolProvider = new SymbolProvider(this);
	public classes = new Map<ts.Symbol, ClassInfo>();

	public rojoResolver?: RojoResolver;
	public pathTranslator!: PathTranslator;
	public buildInfo!: BuildInfo;

	public includeDirectory: string;
	public rootDirectory: string;
	public packageName: string;
	public isGame: boolean;

	public callMacros = new Map<ts.Symbol, CallMacro>();
	public genericIdMap?: Map<ts.Symbol, GenericIdOptions>;
	public inferExpressions = new Map<ts.SourceFile, ts.Identifier>();
	public isUserMacroCache = new Map<ts.Symbol, boolean>();

	private setupBuildInfo() {
		let baseBuildInfo = BuildInfo.fromDirectory(this.currentDirectory);
		if (!baseBuildInfo || (Cache.isInitialCompile && isCleanBuildDirectory(this.options))) {
			if (this.options.incremental && this.options.tsBuildInfoFile) {
				if (ts.sys.fileExists(this.options.tsBuildInfoFile)) {
					throw new Error(`Flamework cannot be built in a dirty environment, please delete your tsbuildinfo`);
				}
			}
			baseBuildInfo = new BuildInfo(path.join(this.currentDirectory, "flamework.build"));
		}
		this.buildInfo = baseBuildInfo;
		this.buildInfo.setConfig(undefined);

		const configPath = path.join(this.rootDirectory, "flamework.json");
		if (fs.existsSync(configPath)) {
			const result = JSON.parse(fs.readFileSync(configPath, { encoding: "ascii" }));
			if (validateSchema("config", result)) {
				this.buildInfo.setConfig(result);
			} else {
				Logger.error(`Malformed flamework.json`);
				for (const error of getSchemaErrors()) {
					Logger.error(
						`${error.keyword} ${error.instancePath}: ${error.message} ${JSON.stringify(error.params)}`,
					);
				}
				process.exit(1);
			}
		}

		const candidates = Cache.buildInfoCandidates ?? [];
		if (!Cache.buildInfoCandidates) {
			Cache.buildInfoCandidates = candidates;
			const candidatesSet = new Set<string>();
			for (const file of this.program.getSourceFiles()) {
				const buildCandidate = BuildInfo.findCandidateUpper(path.dirname(file.fileName));
				if (
					buildCandidate &&
					!arePathsEqual(buildCandidate, baseBuildInfo.buildInfoPath) &&
					!candidatesSet.has(buildCandidate)
				) {
					candidatesSet.add(buildCandidate);
					candidates.push(buildCandidate);
				}
			}
		}

		for (const candidate of candidates) {
			const relativeCandidate = path.relative(this.currentDirectory, candidate);
			const buildInfo = BuildInfo.fromPath(candidate);
			if (buildInfo) {
				Logger.infoIfVerbose(`Loaded buildInfo at ${relativeCandidate}, next id: ${buildInfo.getLatestId()}`);
				baseBuildInfo.addBuildInfo(buildInfo);
			} else {
				Logger.warn(`Build info not valid at ${relativeCandidate}`);
			}
		}
	}

	private setupRojo() {
		this.pathTranslator = createPathTranslator(this.program);

		const rojoArgvIndex = process.argv.findIndex((v) => v === "--rojo");
		const rojoArg = rojoArgvIndex !== -1 ? process.argv[rojoArgvIndex + 1] : undefined;

		let rojoConfig: string | undefined;
		if (rojoArg && rojoArg !== "") {
			rojoConfig = path.resolve(rojoArg);
		} else {
			rojoConfig = RojoResolver.findRojoConfigFilePath(this.currentDirectory).path;
		}

		if (rojoConfig !== undefined) {
			const rojoContents = fs.readFileSync(rojoConfig, { encoding: "ascii" });
			const sum = crypto.createHash("md5").update(rojoContents).digest("hex");

			if (sum === Cache.rojoSum) {
				this.rojoResolver = Cache.rojoResolver;
			} else {
				this.rojoResolver = RojoResolver.fromPath(rojoConfig);
				Cache.rojoSum = sum;
				Cache.rojoResolver = this.rojoResolver;
			}
		}
	}

	private getIncludePath() {
		const includeArgvIndex = process.argv.findIndex((v) => v === "--i" || v === "--includePath");
		const includePath = includeArgvIndex !== -1 ? process.argv[includeArgvIndex + 1] : undefined;
		return path.resolve(includePath || path.join(this.rootDirectory, "include"));
	}

	/**
	 * Since npm modules can be symlinked, TypeScript can resolve them to their real path (outside of the project directory.)
	 *
	 * This function attempts to convert the real path of *npm modules* back to their path inside the project directory.
	 * This is required to have RojoResolver be able to resolve files.
	 */
	private toModulePath(filePath: string) {
		// The module is under our root directory, so it's probably not symlinked.
		if (isPathDescendantOf(filePath, this.rootDirectory)) {
			return filePath;
		}

		const packageJsonPath = ts.findPackageJson(filePath, ts.sys as never);
		if (!packageJsonPath) {
			throw new Error(`Unable to convert '${filePath}' to module.`);
		}

		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));
		return path.join(
			this.rootDirectory,
			"node_modules",
			packageJson.name,
			path.relative(path.dirname(packageJsonPath), filePath),
		);
	}

	private calculateGlobs(globs: Record<string, string[]> | undefined) {
		if (!globs) {
			return;
		}

		for (const pathGlob in globs) {
			const paths = glob.sync(pathGlob, {
				root: this.rootDirectory,
				cwd: this.rootDirectory,
				nocase: true,
			});

			globs[pathGlob] = paths.map((globPath) => {
				const outputPath = this.pathTranslator.getOutputPath(globPath);
				return path.relative(this.rootDirectory, outputPath).replace(/\\/g, "/");
			});
		}
	}

	private convertGlobs(
		globs: Record<string, string[]> | undefined,
		luaOut: Map<string, Array<ReadonlyArray<string>>>,
		pkg?: string,
	) {
		if (!globs) {
			return;
		}

		const pkgInfo = pkg ? this.buildInfo.getBuildInfoFromPrefix(pkg) : undefined;
		const root = pkgInfo ? path.dirname(this.toModulePath(pkgInfo.buildInfoPath)) : this.rootDirectory;

		for (const pathGlob in globs) {
			const paths = globs[pathGlob];
			const rbxPaths = new Array<RbxPath>();
			for (const globPath of paths) {
				const rbxPath = this.rojoResolver?.getRbxPathFromFilePath(path.join(root, globPath));
				if (rbxPath) {
					rbxPaths.push(rbxPath);
				}
			}

			luaOut.set(pkgInfo ? pathGlob : this.obfuscateText(pathGlob, "addPaths"), rbxPaths);
		}
	}

	constructor(
		public program: ts.Program,
		public context: ts.TransformationContext,
		public config: TransformerConfig,
	) {
		const { result: packageJson, directory } = getPackageJson(this.currentDirectory);
		this.rootDirectory = directory;
		assert(packageJson.name);

		this.setupRojo();
		this.setupBuildInfo();

		config.idGenerationMode ??= config.obfuscation ? "obfuscated" : "full";

		this.packageName = packageJson.name;
		this.isGame = !this.packageName.startsWith("@");
		this.includeDirectory = this.getIncludePath();

		if (!this.isGame) config.hashPrefix ??= this.packageName;
		this.buildInfo.setIdentifierPrefix(config.hashPrefix);

		if (config.hashPrefix?.startsWith("$") && !config.$rbxpackmode$) {
			throw new Error(`The hashPrefix $ is used internally by Flamework`);
		}

		Cache.isInitialCompile = false;
	}

	getFileId(file: ts.SourceFile) {
		return path.relative(this.rootDirectory, file.fileName).replace(/\\/g, "/");
	}

	saveArtifacts() {
		const start = new Date().getTime();

		this.calculateGlobs(this.buildInfo.getMetadata("globs")?.paths);

		if (this.isGame) {
			const writtenFiles = new Map<string, string>();
			const files = ["config.json", "globs.json"];

			const packageConfig = this.buildInfo.getChildrenMetadata("config");
			const config = this.buildInfo.getMetadata("config");
			if (config || packageConfig.size > 0) {
				writtenFiles.set(
					"config.json",
					JSON.stringify({
						game: config,
						packages: Object.fromEntries(packageConfig),
					}),
				);
			}

			const packageGlobs = this.buildInfo.getChildrenMetadata("globs");
			const globs = this.buildInfo.getMetadata("globs");
			if (globs || packageGlobs.size > 0) {
				const transformedGlobs = new Map<string, string[][]>();
				this.convertGlobs(globs?.paths, transformedGlobs);

				const transformedPackageGlobs = new Map<string, Record<string, string[][]>>();
				for (const [pkg, packageGlob] of packageGlobs) {
					const transformedGlobs = new Map<string, string[][]>();
					this.convertGlobs(packageGlob?.paths, transformedGlobs, pkg);
					transformedPackageGlobs.set(pkg, Object.fromEntries(transformedGlobs));
				}

				writtenFiles.set(
					"globs.json",
					JSON.stringify({
						game: Object.fromEntries(transformedGlobs),
						packages: Object.fromEntries(transformedPackageGlobs),
					}),
				);
			}

			const metadataPath = path.join(this.includeDirectory, "flamework");
			const metadataExists = fs.existsSync(metadataPath);

			if (!metadataExists && writtenFiles.size > 0) {
				fs.mkdirSync(metadataPath);
			}

			for (const file of files) {
				const filePath = path.join(metadataPath, file);
				const contents = writtenFiles.get(file);
				if (contents) {
					fs.writeFileSync(filePath, contents);
				} else if (fs.existsSync(filePath)) {
					fs.rmSync(filePath);
				}
			}

			if (metadataExists && writtenFiles.size === 0) {
				fs.rmdirSync(metadataPath);
			}
		}

		this.buildInfo.save();

		if (Logger.verbose) {
			// Watch mode includes an extra newline when compilation finishes,
			// so we remove that newline before Flamework's message.
			const watch = process.argv.includes("-w") || process.argv.includes("--watch");
			if (watch) {
				process.stdout.write("\x1b[A\x1b[K");
			}

			Logger.info(`Flamework artifacts finished in ${new Date().getTime() - start}ms`);

			if (watch) {
				process.stdout.write("\n");
			}
		}
	}

	isUserMacro(symbol: ts.Symbol) {
		const cached = this.isUserMacroCache.get(symbol);
		if (cached !== undefined) return cached;

		if (symbol.declarations) {
			for (const declaration of symbol.declarations) {
				const metadata = new NodeMetadata(this, declaration);
				if (metadata.isRequested("macro")) {
					this.isUserMacroCache.set(symbol, true);
					return true;
				}
			}
		}

		this.isUserMacroCache.set(symbol, false);
		return false;
	}

	private areMacrosSetup = false;
	setupMacros() {
		if (this.areMacrosSetup) return;
		this.areMacrosSetup = true;

		for (const macro of CALL_MACROS) {
			const symbols = macro.getSymbol(this);
			if (Array.isArray(symbols)) {
				for (const symbol of symbols) {
					this.callMacros.set(symbol, macro);
				}
				macro._symbols = symbols;
			} else {
				this.callMacros.set(symbols, macro);
				macro._symbols = [symbols];
			}
		}
	}

	public fileImports = new Map<string, ImportInfo[]>();
	addFileImport(file: ts.SourceFile, importPath: string, name: string): ts.Identifier {
		const symbolProvider = this.symbolProvider;

		if (importPath === "@flamework/core") {
			if (
				(file === symbolProvider.flameworkFile.file ||
					this.getSymbol(file) === symbolProvider.flameworkFile.fileSymbol) &&
				name === "Flamework"
			) {
				return f.identifier("Flamework");
			}

			const flameworkDir = path.dirname(symbolProvider.flameworkFile.file.fileName);
			const modulePath = path.join(flameworkDir, name === "Reflect" ? "reflect" : "flamework");

			if (isPathDescendantOf(file.fileName, flameworkDir)) {
				importPath = "./" + path.relative(path.dirname(file.fileName), modulePath) || ".";
			}
		}

		let importInfos = this.fileImports.get(file.fileName);
		if (!importInfos) this.fileImports.set(file.fileName, (importInfos = []));

		let importInfo = importInfos.find((x) => x.path === importPath);
		if (!importInfo) importInfos.push((importInfo = { path: importPath, entries: [] }));

		let identifier = importInfo.entries.find((x) => x.name === name)?.identifier;

		if (!identifier) {
			start: for (const statement of file.statements) {
				if (!f.is.importDeclaration(statement)) break;
				if (!f.is.string(statement.moduleSpecifier)) continue;
				if (!f.is.importClauseDeclaration(statement.importClause)) continue;
				if (!f.is.namedImports(statement.importClause.namedBindings)) continue;
				if (statement.moduleSpecifier.text !== importPath) continue;

				for (const importElement of statement.importClause.namedBindings.elements) {
					if (importElement.propertyName) {
						if (importElement.propertyName.text === name) {
							identifier = importElement.name;
							break start;
						}
					} else {
						if (importElement.name.text === name) {
							identifier = importElement.name;
							break start;
						}
					}
				}
			}
		}

		if (!identifier) {
			importInfo.entries.push({ name, identifier: (identifier = f.identifier(name, true)) });
		}

		return identifier;
	}

	getSourceFile(node: ts.Node) {
		const parseNode = ts.getParseTreeNode(node);
		if (!parseNode) throw new Error(`Could not find parse tree node`);

		return ts.getSourceFileOfNode(parseNode);
	}

	getSymbol(node: ts.Node, followAlias = true): ts.Symbol | undefined {
		if (f.is.namedDeclaration(node)) {
			return this.getSymbol(node.name);
		}

		const symbol = this.typeChecker.getSymbolAtLocation(node);

		if (symbol && followAlias) {
			return ts.skipAlias(symbol, this.typeChecker);
		} else {
			return symbol;
		}
	}

	hash(id: number, noPrefix?: boolean) {
		const hashPrefix = this.config.hashPrefix;
		const salt = this.config.salt ?? this.buildInfo.getSalt();
		const hashGenerator = new Hashids(salt, 2);
		if ((this.isGame && !hashPrefix) || noPrefix) {
			return `${hashGenerator.encode(id)}`;
		} else {
			// If the package name is namespaced, then it can be used in
			// other projects so we want to add a prefix to the Id to prevent
			// collisions with other packages or the game.
			return `${hashPrefix ?? this.packageName}:${hashGenerator.encode(id)}`;
		}
	}

	obfuscateText(text: string, context?: string) {
		return this.config.obfuscation ? this.buildInfo.hashString(text, context) : text;
	}

	obfuscateArray<T>(array: ReadonlyArray<T>) {
		return this.config.obfuscation ? shuffle(array) : array;
	}

	public hasErrors = false;
	addDiagnostic(diag: ts.DiagnosticWithLocation) {
		if (diag.category === ts.DiagnosticCategory.Error) {
			this.hasErrors = true;
		}

		this.context.addDiagnostic(diag);
	}

	public hoistedToTop = new Map<ts.SourceFile, ts.Statement[]>();
	hoistToTop(file: ts.SourceFile, node: ts.Statement) {
		let hoisted = this.hoistedToTop.get(file);
		if (!hoisted) this.hoistedToTop.set(file, (hoisted = []));

		hoisted.push(node);
	}

	private prereqStack = new Array<Array<ts.Statement>>();
	capture<T>(cb: () => T): [T, ts.Statement[]] {
		this.prereqStack.push([]);
		const result = cb();
		return [result, this.prereqStack.pop()!];
	}

	prereq(statement: ts.Statement) {
		const stack = this.prereqStack[this.prereqStack.length - 1];
		if (stack) stack.push(statement);
	}

	prereqList(statements: ts.Statement[]) {
		const stack = this.prereqStack[this.prereqStack.length - 1];
		if (stack) stack.push(...statements);
	}

	isCapturing(threshold = 1) {
		return this.prereqStack.length > threshold;
	}

	transform<T extends ts.Node>(node: T): T {
		return ts.visitEachChild(node, (newNode) => transformNode(this, newNode), this.context);
	}

	transformNode<T extends ts.Node>(node: T): T {
		// Technically this isn't guaranteed to return `T`, and TypeScript 5.0+ updated the signature to disallow this,
		// but we don't care so we'll just cast it.
		return ts.visitNode(node, (newNode) => transformNode(this, newNode)) as T;
	}

	private _shouldViewFile(file: ts.SourceFile) {
		const fileName = path.posix.normalize(file.fileName);
		if (IGNORE_RBXTS_REGEX.test(fileName)) return false;

		const buildCandidates = Cache.buildInfoCandidates!;
		for (const candidate of buildCandidates) {
			let realPath = Cache.realPath.get(candidate);
			if (!realPath) Cache.realPath.set(candidate, (realPath = fs.realpathSync(candidate)));

			const candidateDir = path.dirname(realPath);
			if (
				isPathDescendantOf(file.fileName, candidateDir) &&
				!isPathDescendantOf(file.fileName, path.join(candidateDir, "node_modules"))
			) {
				return true;
			}
		}

		return false;
	}

	shouldViewFile(file: ts.SourceFile) {
		const cached = Cache.shouldView?.get(file.fileName);
		if (cached !== undefined) return cached;

		const result = this._shouldViewFile(file);
		Cache.shouldView.set(file.fileName, result);

		return result;
	}
}

interface ImportItem {
	name: string;
	identifier: ts.Identifier;
}

interface ImportInfo {
	path: string;
	entries: Array<ImportItem>;
}
