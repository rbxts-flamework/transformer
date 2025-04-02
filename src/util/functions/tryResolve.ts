export function tryResolve(moduleName: string, path: string): string | undefined {
	try {
		return require.resolve(moduleName, { paths: [path] });
	} catch (e) {}
}
