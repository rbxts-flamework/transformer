import { relocateDiagnostic } from "../../../util/diagnosticsUtils";
import { buildGuardFromType } from "../../../util/functions/buildGuardFromType";
import { CallMacro } from "../macro";

export const FlameworkCreateGuardMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("createGuard");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (firstType) {
			const type = state.typeChecker.getTypeAtLocation(firstType);
			if (type) {
				return relocateDiagnostic(node, buildGuardFromType, state, state.getSourceFile(node), type);
			}
		}
		throw "createGuard could not generate a type guard";
	},
};
