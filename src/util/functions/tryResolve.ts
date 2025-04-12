import ts from "typescript";
import type { TransformState } from "../../classes/transformState";

export function tryResolve(moduleName: string, path: string): string | undefined {
	try {
		return require.resolve(moduleName, { paths: [path] });
	} catch (e) {}
}

export function tryResolveTS(state: TransformState, moduleName: string, path: string): string | undefined {
	const module = ts.resolveModuleName(moduleName, path, state.options, ts.sys);
	return module.resolvedModule?.resolvedFileName;
}
