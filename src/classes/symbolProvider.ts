import ts from "typescript";
import path from "path";
import fs from "fs";
import { isPathDescendantOf } from "../util/functions/isPathDescendantOf";
import { assert } from "./rojoResolver/util/assert";
import { TransformState } from "./transformState";
import { getPackageJson } from "../util/functions/getPackageJson";
import { Logger } from "./logger";
import { f } from "../util/factory";

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

class InterfaceSymbol {
	public interfaceSymbol: ts.Symbol;

	constructor(
		public fileSymbol: FileSymbol,
		public parentSymbol: FileSymbol | NamespaceSymbol,
		public node: ts.InterfaceDeclaration,
	) {
		const interfaceSymbol = fileSymbol.state.getSymbol(node.name);
		assert(interfaceSymbol);

		this.interfaceSymbol = interfaceSymbol;
	}

	get(name: string) {
		const memberSymbol = this.interfaceSymbol.members?.get(name as ts.__String);
		assert(memberSymbol, `Name ${name} not found in ${this.interfaceSymbol.name}`);

		return memberSymbol;
	}
}

class TypeSymbol {
	public typeSymbol: ts.Symbol;
	public type: ts.Type;

	constructor(
		public fileSymbol: FileSymbol,
		public parentSymbol: FileSymbol | NamespaceSymbol,
		public node: ts.TypeAliasDeclaration,
	) {
		const typeSymbol = fileSymbol.state.getSymbol(node.name);
		const type = fileSymbol.state.typeChecker.getTypeAtLocation(node.name);
		assert(typeSymbol);
		assert(type);

		this.type = type;
		this.typeSymbol = typeSymbol;
	}

	get(name: string) {
		const memberSymbol = this.type.getProperty(name);
		assert(memberSymbol, `Name ${name} not found in ${this.typeSymbol.name}`);

		return memberSymbol;
	}
}

class NamespaceSymbol {
	public classes = new Map<string, ClassSymbol>();
	public namespaces = new Map<string, NamespaceSymbol>();
	public interfaces = new Map<string, InterfaceSymbol>();
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

	getInterface(name: string) {
		const interfaceSymbol = this.interfaces.get(name);
		assert(interfaceSymbol);

		return interfaceSymbol;
	}

	getType(name: string) {
		const typeSymbol = this.types.get(name);
		assert(typeSymbol);

		return typeSymbol;
	}

	registerNamespace(node: ts.NamespaceDeclaration) {
		assert(f.is.moduleBlockDeclaration(node.body));

		const namespaceSymbol = new NamespaceSymbol(this.fileSymbol, this, node);
		namespaceSymbol.register();

		this.namespaces.set(node.name.text, namespaceSymbol);
	}

	registerClass(node: ts.ClassDeclaration) {
		assert(node.name);

		const classSymbol = new ClassSymbol(this.fileSymbol, this, node);

		this.classes.set(node.name.text, classSymbol);
	}

	registerInterface(node: ts.InterfaceDeclaration) {
		const interfaceSymbol = new InterfaceSymbol(this.fileSymbol, this, node);
		this.interfaces.set(node.name.text, interfaceSymbol);
	}

	registerType(node: ts.TypeAliasDeclaration) {
		const typeSymbol = new TypeSymbol(this.fileSymbol, this, node);
		this.types.set(node.name.text, typeSymbol);
	}

	register() {
		assert(f.is.moduleBlockDeclaration(this.node.body));

		for (const statement of this.node.body.statements) {
			if (f.is.namespaceDeclaration(statement)) {
				this.registerNamespace(statement);
			} else if (f.is.classDeclaration(statement)) {
				this.registerClass(statement);
			} else if (f.is.interfaceDeclaration(statement)) {
				this.registerInterface(statement);
			} else if (f.is.typeAliasDeclaration(statement)) {
				this.registerType(statement);
			}
		}
	}
}

class FileSymbol {
	public namespaces = new Map<string, NamespaceSymbol>();
	public classes = new Map<string, ClassSymbol>();
	public interfaces = new Map<string, InterfaceSymbol>();
	public types = new Map<string, TypeSymbol>();

	public fileSymbol: ts.Symbol;

	constructor(public state: TransformState, public file: ts.SourceFile, public name: string) {
		const fileSymbol = this.state.getSymbol(file);
		assert(fileSymbol);

		this.fileSymbol = fileSymbol;
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

	getInterface(name: string) {
		const interfaceSymbol = this.interfaces.get(name);
		assert(interfaceSymbol);

		return interfaceSymbol;
	}

	getType(name: string) {
		const typeSymbol = this.types.get(name);
		assert(typeSymbol);

		return typeSymbol;
	}

	registerNamespace(node: ts.NamespaceDeclaration) {
		assert(f.is.moduleBlockDeclaration(node.body));

		const namespaceSymbol = new NamespaceSymbol(this, this, node);
		namespaceSymbol.register();

		this.namespaces.set(node.name.text, namespaceSymbol);
	}

	registerClass(node: ts.ClassDeclaration) {
		if (!node.name) console.log(node.getText());
		assert(node.name);

		const classSymbol = new ClassSymbol(this, this, node);
		this.classes.set(node.name.text, classSymbol);
	}

	registerInterface(node: ts.InterfaceDeclaration) {
		const interfaceSymbol = new InterfaceSymbol(this, this, node);
		this.interfaces.set(node.name.text, interfaceSymbol);
	}

	registerType(node: ts.TypeAliasDeclaration) {
		const typeSymbol = new TypeSymbol(this, this, node);
		this.types.set(node.name.text, typeSymbol);
	}

	register() {
		for (const statement of this.file.statements) {
			if (f.is.namespaceDeclaration(statement)) {
				this.registerNamespace(statement);
			} else if (f.is.classDeclaration(statement)) {
				this.registerClass(statement);
			} else if (f.is.interfaceDeclaration(statement)) {
				this.registerInterface(statement);
			} else if (f.is.typeAliasDeclaration(statement)) {
				this.registerType(statement);
			}
		}
	}
}

const EXCLUDED_NAME_DIR = new Set(["src/", "lib/", "out/"]);

export class SymbolProvider {
	public fileSymbols = new Map<string, FileSymbol>();

	public flameworkFile!: FileSymbol;
	public componentsFile!: FileSymbol;

	public flamework!: NamespaceSymbol;
	public components!: ClassSymbol;

	constructor(public state: TransformState) {}

	private rbxtsDir = path.join(this.state.currentDirectory, "node_modules", "@rbxts");
	private flameworkDir = fs.realpathSync(path.join(this.rbxtsDir, "flamework", "out"));

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

	findFile(name: string) {
		return this.fileSymbols.get(name);
	}

	getFile(name: string) {
		const fileSymbol = this.findFile(name);
		assert(fileSymbol, `Could not find fileSymbol for '${name}'`);

		return fileSymbol;
	}

	registerFileSymbol(file: ts.SourceFile) {
		const { result, directory } = getPackageJson(file.fileName);
		assert(result.name);

		const name = this.getName(result.name, directory, file);
		assert(!this.fileSymbols.has(name), "Attempt to register file twice");

		const fileSymbol = new FileSymbol(this.state, file, name);
		this.fileSymbols.set(name, fileSymbol);

		Logger.writeLine(`Registering ${name}`);
		fileSymbol.register();
		return fileSymbol;
	}

	isFileInteresting(file: ts.SourceFile) {
		if (this.state.config.$rbxpackmode$ && isPathDescendantOf(file.fileName, this.state.srcDir)) {
			return true;
		}

		if (isPathDescendantOf(file.fileName, this.flameworkDir)) {
			return true;
		}

		return false;
	}

	registerInterestingFiles() {
		for (const file of this.state.program.getSourceFiles()) {
			if (this.isFileInteresting(file)) {
				this.registerFileSymbol(file);
			}
		}

		this.finalize();
	}

	finalize() {
		this.flameworkFile = this.getFile("@rbxts/flamework/flamework");
		this.componentsFile = this.getFile("@rbxts/flamework/components");

		this.flamework = this.flameworkFile.getNamespace("Flamework");
		this.components = this.componentsFile.getClass("Components");
	}
}
