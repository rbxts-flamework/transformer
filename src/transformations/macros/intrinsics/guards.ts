import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { buildGuardFromType } from "../../../util/functions/buildGuardFromType";

/**
 * This function is used as a more optimized approach to `Modding.Generic<T, "guard">` as it does not generate an extra object.
 *
 * Eventually, this function should be replaced with first-class support for this type of metadata.
 */
export function buildGuardIntrinsic(state: TransformState, node: ts.Node, type: ts.Type) {
	return buildGuardFromType(state, node, type, node.getSourceFile());
}

export function buildCallbackGuardsIntrinsic(state: TransformState, node: ts.Node, methodType: ts.Type) {
	const file = state.getSourceFile(node);
	const signatures = methodType.getCallSignatures();
	if (signatures.length > 1) {
		Diagnostics.error(node, `Flamework encountered multiple call signatures for '${methodType.symbol.name}'.`);
	}

	const signature = signatures[0];
	if (!signature) {
		Diagnostics.error(node, `Flamework encountered non-callback: ${state.typeChecker.typeToString(methodType)}`);
	}

	const guards = new Array<ts.Expression>();
	let restGuard: ts.Expression = f.nil();
	for (const param of signature.parameters) {
		const paramType = state.typeChecker.getTypeOfSymbolAtLocation(param, node);
		const parameterDeclaration = param.valueDeclaration;
		if (parameterDeclaration && ts.isRestParameter(parameterDeclaration as ts.ParameterDeclaration)) {
			const elementType = state.typeChecker.getElementTypeOfArrayType(paramType);
			if (elementType) {
				restGuard = buildGuardFromType(state, parameterDeclaration, elementType, file);
			}
			break;
		}
		guards.push(buildGuardFromType(state, parameterDeclaration ?? signature.getDeclaration(), paramType, file));
	}

	return f.array([f.array(guards), restGuard]);
}
