/* eslint-disable @typescript-eslint/no-var-requires */
import { existsSync } from "fs";
import { Module } from "module";
import path from "path";
import { isPathDescendantOf } from "./util/functions/isPathDescendantOf";

function resolve(moduleName: string, path: string): string | undefined {
	try {
		return require.resolve(moduleName, { paths: [path] });
	} finally {
	}
}

const cwd = process.cwd();
const originalRequire = Module.prototype.require;

function shouldTryHooking() {
	if (process.argv.includes("--no-flamework-hook")) {
		return false;
	}

	if (process.argv.includes("--force-flamework-hook")) {
		return true;
	}

	// Ensure we're running in the context of a project and not a multiplace repository or something,
	// as we don't have access to the project directory until roblox-ts invokes the transformer.
	if (
		!existsSync(path.join(cwd, "tsconfig.json")) ||
		!existsSync(path.join(cwd, "package.json")) ||
		!existsSync(path.join(cwd, "node_modules"))
	) {
		return false;
	}

	return true;
}

function hook() {
	const robloxTsPath = resolve("roblox-ts", cwd);
	if (!robloxTsPath) {
		return;
	}

	const robloxTsTypeScript = resolve("typescript", robloxTsPath);
	if (!robloxTsTypeScript) {
		return;
	}

	Module.prototype.require = function flameworkHook(this: NodeJS.Module, id) {
		// Overwrite any Flamework TypeScript imports to roblox-ts' version.
		// To be on the safe side, this won't hook it in packages.
		if (id === "typescript" && isPathDescendantOf(this.filename, __dirname)) {
			return originalRequire.call(this, path.join(robloxTsTypeScript));
		}

		return originalRequire.call(this, id);
	} as NodeJS.Require;
}

if (shouldTryHooking()) {
	hook();
}

const transformer = require("./transformer");

// After loading Flamework, we can unhook require.
Module.prototype.require = originalRequire;

export = transformer;
