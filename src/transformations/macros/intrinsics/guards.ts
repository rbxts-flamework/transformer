import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { buildGuardFromType } from "../../../util/functions/buildGuardFromType";
import { isArrayType, isTupleType } from "../../../util/functions/isTupleType";

/**
 * This intrinsic generates an array of element guards along with a rest guard for a tuple type.
 *
 * Whilst this is possible in TypeScript, it requires either slightly complex types or additional metadata.
 * This serves as a simple fast path.
 */
export function buildTupleGuardsIntrinsic(state: TransformState, node: ts.Node, tupleType: ts.Type) {
	const file = state.getSourceFile(node);

	// Tuples with only a rest element will get turned into an array
	if (isArrayType(state, tupleType)) {
		const guard = buildGuardFromType(state, node, tupleType.typeArguments![0], file);
		return f.array([f.array([]), guard]);
	}

	if (!isTupleType(state, tupleType) || !tupleType.typeArguments) {
		Diagnostics.error(node, `Intrinsic encountered non-tuple type: ${state.typeChecker.typeToString(tupleType)}`);
	}

	const guards = new Array<ts.Expression>();
	let restGuard: ts.Expression = f.nil();
	for (let i = 0; i < tupleType.typeArguments.length; i++) {
		const element = tupleType.typeArguments[i];
		const declaration = tupleType.target.labeledElementDeclarations?.[i];
		const guard = buildGuardFromType(state, declaration ?? node, element, file);

		if (tupleType.target.elementFlags[i] & ts.ElementFlags.Rest) {
			restGuard = guard;
		} else {
			guards.push(guard);
		}
	}

	return f.array([f.array(guards), restGuard]);
}
