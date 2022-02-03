import ts from "typescript";
import path from "path";
import fs from "fs";
import { isPathDescendantOf } from "../util/functions/isPathDescendantOf";
import { assert } from "./rojoResolver/util/assert";
import { TransformState } from "./transformState";
import { getPackageJson } from "../util/functions/getPackageJson";
import { Logger } from "./logger";
import { f } from "../util/factory";
import chalk from "chalk";
import { Cache } from "../util/cache";
import { emitTypescriptMismatch } from "../util/functions/emitTypescriptMismatch";

const EXCLUDED_NAME_DIR = new Set(["src/", "lib/", "out/"]);

export class SymbolProvider {
	public fileSymbols = new Map<string, FileSymbol>();

	public moddingFile!: FileSymbol;
	public flameworkFile!: FileSymbol;
	public componentsFile?: FileSymbol;
	public networkingFile?: FileSymbol;

	public flamework!: NamespaceSymbol;
	public components?: ClassSymbol;
	public networking?: NamespaceSymbol;

	constructor(public state: TransformState) {}

	private resolveModuleDir(moduleName: string) {
		const modulePath = Cache.moduleResolution.get(moduleName);
		if (modulePath !== undefined) return modulePath || undefined;

		const dummyFile = path.join(this.state.srcDir, "dummy.ts");
		const module = ts.resolveModuleName(moduleName, dummyFile, this.state.options, ts.sys);
		const resolvedModule = module.resolvedModule;
		if (resolvedModule) {
			const modulePath = fs.realpathSync(path.join(resolvedModule.resolvedFileName, "../"));
			Cache.moduleResolution.set(moduleName, modulePath);
			return modulePath;
		}
		Cache.moduleResolution.set(moduleName, false);
	}

	findFile(name: string) {
		return this.fileSymbols.get(name);
	}

	getFile(name: string) {
		const fileSymbol = this.findFile(name);
		assert(fileSymbol, `Could not find fileSymbol for '${name}'`);

		return fileSymbol;
	}

	registerInterestingFiles() {
		for (const file of this.state.program.getSourceFiles()) {
			if (this.isFileInteresting(file)) {
				this.registerFileSymbol(file);
			}
		}

		this.finalize();
	}

	private getName(packageName: string, directory: string, file: ts.SourceFile) {
		const relativePath = path
			.relative(directory, file.fileName)
			.replace(/\\/g, "/")
			.replace(/(\.d)?.ts$/, "");

		if (EXCLUDED_NAME_DIR.has(relativePath.substr(0, 4))) {
			return `${packageName}/${relativePath.substr(4)}`;
		}

		return `${packageName}/${relativePath}`;
	}

	private registeredFiles = 0;
	private registerFileSymbol(file: ts.SourceFile) {
		const { result, directory } = getPackageJson(file.fileName);
		assert(result.name);

		const name = this.getName(result.name, directory, file);
		assert(!this.fileSymbols.has(name), "Attempt to register file twice");

		const fileSymbol = new FileSymbol(this.state, file, name);
		this.fileSymbols.set(name, fileSymbol);

		this.registeredFiles++;
		return fileSymbol;
	}

	private flameworkDir = this.resolveModuleDir("@flamework/core");
	private componentsDir = this.resolveModuleDir("@flamework/components");
	private networkingDir = this.resolveModuleDir("@flamework/networking");
	private isFileInteresting(file: ts.SourceFile) {
		if (this.state.config.$rbxpackmode$ && isPathDescendantOf(file.fileName, this.state.srcDir)) {
			return true;
		}

		if (this.flameworkDir && isPathDescendantOf(file.fileName, this.flameworkDir)) {
			return true;
		}

		if (this.componentsDir && isPathDescendantOf(file.fileName, this.componentsDir)) {
			return true;
		}

		if (this.networkingDir && isPathDescendantOf(file.fileName, this.networkingDir)) {
			return true;
		}

		return false;
	}

	private finalize() {
		this.moddingFile = this.getFile("@flamework/core/modding");
		this.flameworkFile = this.getFile("@flamework/core/flamework");
		this.componentsFile = this.findFile("@flamework/components/index");
		this.networkingFile = this.findFile("@flamework/networking/index");

		if (
			!this.flameworkFile.namespaces.has("Flamework") ||
			(this.componentsFile && !this.componentsFile.classes.has("Components")) ||
			(this.networkingFile && !this.networkingFile.namespaces.has("Networking"))
		) {
			emitTypescriptMismatch(this.state, chalk.red("Failed to load! Symbols were not populated"));
		}

		this.flamework = this.flameworkFile.getNamespace("Flamework");
		this.components = this.componentsFile?.getClass("Components");
		this.networking = this.networkingFile?.getNamespace("Networking");

		Logger.writeLineIfVerbose(`Registered symbols in ${this.registeredFiles} files`);
	}
}

class ClassSymbol {
	public classSymbol: ts.Symbol;

	constructor(
		public fileSymbol: FileSymbol,
		public parentSymbol: FileSymbol | NamespaceSymbol,
		public node: ts.ClassDeclaration,
	) {
		const classSymbol = fileSymbol.state.getSymbol(node.name!);
		assert(classSymbol);

		this.classSymbol = classSymbol;
	}

	get(name: string) {
		const memberSymbol = this.classSymbol.members?.get(name as ts.__String);
		assert(memberSymbol, `Name ${name} not found in ${this.classSymbol.name}`);

		return memberSymbol;
	}

	getStatic(name: string) {
		const exportSymbol = this.classSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol, `Static name ${name} not found in ${this.classSymbol.name}`);

		return exportSymbol;
	}
}

class TypeSymbol {
	public typeSymbol: ts.Symbol;

	constructor(
		public fileSymbol: FileSymbol,
		public parentSymbol: FileSymbol | NamespaceSymbol,
		public node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
	) {
		const typeSymbol = fileSymbol.state.getSymbol(node.name);
		assert(typeSymbol);

		this.typeSymbol = typeSymbol;
	}

	get(name: string) {
		const memberSymbol = this.typeSymbol.members?.get(name as ts.__String);
		assert(memberSymbol, `Name ${name} not found in ${this.typeSymbol.name}`);

		return memberSymbol;
	}
}

class NamespaceSymbol {
	public classes = new Map<string, ClassSymbol>();
	public namespaces = new Map<string, NamespaceSymbol>();
	public types = new Map<string, TypeSymbol>();

	public namespaceSymbol: ts.Symbol;

	constructor(
		public fileSymbol: FileSymbol,
		public parentSymbol: NamespaceSymbol | FileSymbol,
		public node: ts.NamespaceDeclaration,
	) {
		const namespaceSymbol = fileSymbol.state.getSymbol(node.name);
		assert(namespaceSymbol);

		this.namespaceSymbol = namespaceSymbol;
		this.register();
	}

	get(name: string) {
		const exportSymbol = this.namespaceSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol, `Name ${name} not found in ${this.namespaceSymbol.name}`);

		return exportSymbol;
	}

	getNamespace(name: string) {
		const namespace = this.namespaces.get(name);
		assert(namespace);

		return namespace;
	}

	getClass(name: string) {
		const classSymbol = this.classes.get(name);
		assert(classSymbol);

		return classSymbol;
	}

	getType(name: string) {
		const typeSymbol = this.types.get(name);
		assert(typeSymbol);

		return typeSymbol;
	}

	private registerNamespace(node: ts.NamespaceDeclaration) {
		assert(f.is.moduleBlockDeclaration(node.body));

		const namespaceSymbol = new NamespaceSymbol(this.fileSymbol, this, node);
		namespaceSymbol.register();

		this.namespaces.set(node.name.text, namespaceSymbol);
	}

	private registerClass(node: ts.ClassDeclaration) {
		assert(node.name);

		const classSymbol = new ClassSymbol(this.fileSymbol, this, node);

		this.classes.set(node.name.text, classSymbol);
	}

	private registerType(node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration) {
		const typeSymbol = new TypeSymbol(this.fileSymbol, this, node);
		this.types.set(node.name.text, typeSymbol);
	}

	private register() {
		assert(f.is.moduleBlockDeclaration(this.node.body));

		for (const statement of this.node.body.statements) {
			if (f.is.namespaceDeclaration(statement)) {
				this.registerNamespace(statement);
			} else if (f.is.classDeclaration(statement)) {
				this.registerClass(statement);
			} else if (f.is.typeAliasDeclaration(statement) || f.is.interfaceDeclaration(statement)) {
				this.registerType(statement);
			}
		}
	}
}

class FileSymbol {
	public namespaces = new Map<string, NamespaceSymbol>();
	public classes = new Map<string, ClassSymbol>();
	public types = new Map<string, TypeSymbol>();

	public fileSymbol: ts.Symbol;

	constructor(public state: TransformState, public file: ts.SourceFile, public name: string) {
		const fileSymbol = this.state.getSymbol(file);
		assert(fileSymbol);

		this.fileSymbol = fileSymbol;
		this.register();
	}

	get(name: string) {
		const exportSymbol = this.fileSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol);

		return exportSymbol;
	}

	getNamespace(name: string) {
		const namespace = this.namespaces.get(name);
		assert(namespace);

		return namespace;
	}

	getClass(name: string) {
		const classSymbol = this.classes.get(name);
		assert(classSymbol);

		return classSymbol;
	}

	getType(name: string) {
		const typeSymbol = this.types.get(name);
		assert(typeSymbol);

		return typeSymbol;
	}

	private registerNamespace(node: ts.NamespaceDeclaration) {
		assert(f.is.moduleBlockDeclaration(node.body));

		const namespaceSymbol = new NamespaceSymbol(this, this, node);

		this.namespaces.set(node.name.text, namespaceSymbol);
	}

	private registerClass(node: ts.ClassDeclaration) {
		if (!node.name) console.log(node.getText());
		assert(node.name);

		const classSymbol = new ClassSymbol(this, this, node);
		this.classes.set(node.name.text, classSymbol);
	}

	private registerType(node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration) {
		const typeSymbol = new TypeSymbol(this, this, node);
		this.types.set(node.name.text, typeSymbol);
	}

	private register() {
		for (const statement of this.file.statements) {
			if (f.is.namespaceDeclaration(statement)) {
				this.registerNamespace(statement);
			} else if (f.is.classDeclaration(statement)) {
				this.registerClass(statement);
			} else if (f.is.typeAliasDeclaration(statement) || f.is.interfaceDeclaration(statement)) {
				this.registerType(statement);
			}
		}
	}
}
