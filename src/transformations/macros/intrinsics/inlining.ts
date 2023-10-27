import ts from "typescript";
import { f } from "../../../util/factory";

/**
 * An inlining intrinsic for basic return types.
 */
export function inlineMacroIntrinsic(signature: ts.Signature, args: ts.Expression[], parameter: ts.Symbol) {
	const parameterIndex = signature.parameters.findIndex((v) => v.valueDeclaration?.symbol === parameter);
	const argument = args[parameterIndex];
	return f.as(argument, signature.getDeclaration().type!);
}
