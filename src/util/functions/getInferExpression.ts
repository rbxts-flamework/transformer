import ts from "typescript";
import { TransformState } from "../../classes/transformState";
import { f } from "../factory";

export function getInferExpression(state: TransformState, file: ts.SourceFile) {
	const expression = state.inferExpressions.get(file);
	if (expression) return expression;

	const identifier = f.identifier("inferExpression", file.identifiers.has("inferExpression"));
	state.inferExpressions.set(file, identifier);

	const typeParameter = f.identifier("T");
	state.hoistToTop(
		file,
		f.functionDeclaration(
			identifier,
			f.block([f.returnStatement(f.bang("undefined"))]),
			[f.parameterDeclaration("_", f.functionType([], f.referenceType(typeParameter)))],
			f.referenceType(typeParameter),
			[f.typeParameterDeclaration(typeParameter)],
		),
	);

	return identifier;
}
