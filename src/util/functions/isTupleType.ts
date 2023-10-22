import ts from "typescript";
import { TransformState } from "../../classes/transformState";

export function isTupleType(state: TransformState, type: ts.Type): type is ts.TupleTypeReference {
	return state.typeChecker.isTupleType(type);
}
