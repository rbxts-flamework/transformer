import ts from "typescript";
import { DiagnosticError, Diagnostics } from "../../../classes/diagnostics";

/**
 * Validates that the specified parameters can be inspected at compile-time (up to a depth of 1)
 */
export function validateParameterConstIntrinsic(
	node: ts.NewExpression | ts.CallExpression,
	signature: ts.Signature,
	parameters: ts.Symbol[],
) {
	for (const parameter of parameters) {
		const parameterIndex = signature.parameters.findIndex((v) => v.valueDeclaration?.symbol === parameter);
		const argument = node.arguments?.[parameterIndex];
		if (!argument) {
			continue;
		}

		// Check if the argument is a literal (string, number, etc)
		if (ts.isLiteralExpression(argument)) {
			continue;
		}

		const elements = ts.isObjectLiteralExpression(argument)
			? argument.properties
			: ts.isArrayLiteralExpression(argument)
			? argument.elements
			: undefined;

		const parameterDiagnostic = Diagnostics.createDiagnostic(
			parameter.valueDeclaration ?? argument,
			ts.DiagnosticCategory.Message,
			"Required because this parameter must be known at compile-time.",
		);

		// This argument is not an object or array literal.
		if (!elements) {
			const baseDiagnostic = Diagnostics.createDiagnostic(
				argument,
				ts.DiagnosticCategory.Error,
				"Flamework expected this argument to be a literal expression.",
			);

			ts.addRelatedInfo(baseDiagnostic, parameterDiagnostic);

			throw new DiagnosticError(baseDiagnostic);
		}

		// We also want to validate that there are no spread operations inside the literal.
		for (const element of elements) {
			if (ts.isSpreadElement(element) || ts.isSpreadAssignment(element)) {
				const baseDiagnostic = Diagnostics.createDiagnostic(
					element,
					ts.DiagnosticCategory.Error,
					"Flamework does not support spread expressions in this location.",
				);

				ts.addRelatedInfo(baseDiagnostic, parameterDiagnostic);

				throw new DiagnosticError(baseDiagnostic);
			}
		}
	}
}
