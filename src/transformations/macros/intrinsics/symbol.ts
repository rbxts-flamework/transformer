import ts from "typescript";
import { TransformState } from "../../../classes/transformState";
import { getNodeUid, getTypeUid } from "../../../util/uid";
import { f } from "../../../util/factory";

/**
 * This function differs from `Modding.Generic<T, "id">` in that it will first try to preserve the symbol information
 * provided in the type argument. If there is no type argument (e.g it was inferred), it will be equivalent to `Modding.Generic`
 *
 * This is unfortunately necessary for certain APIs as things like `typeof Decorator` will lose symbol information,
 * which can be problematic for the Modding APIs.
 */
export function buildSymbolIdIntrinsic(state: TransformState, node: ts.CallExpression, type: ts.Type) {
	const typeArgument = node.typeArguments?.[0];
	if (typeArgument) {
		return f.string(getNodeUid(state, typeArgument));
	}

	return f.string(getTypeUid(state, type, node));
}
