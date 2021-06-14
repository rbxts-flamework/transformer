import ts from "typescript";

export function getSuperClasses(typeChecker: ts.TypeChecker, node: ts.ClassDeclaration) {
	const superClasses = new Array<ts.ClassDeclaration>();
	const superClass = node.heritageClauses?.find((x) => x.token === ts.SyntaxKind.ExtendsKeyword)?.types?.[0];
	if (superClass) {
		const aliasSymbol = typeChecker.getSymbolAtLocation(superClass.expression);
		if (aliasSymbol) {
			const symbol = ts.skipAlias(aliasSymbol, typeChecker);
			const classDeclaration = symbol?.declarations?.find((x): x is ts.ClassDeclaration =>
				ts.isClassDeclaration(x),
			);
			if (classDeclaration) {
				superClasses.push(classDeclaration as never);
				superClasses.push(...getSuperClasses(typeChecker, classDeclaration));
			}
		}
	}
	return superClasses;
}
