import { Diagnostics } from "../../../../../classes/diagnostics";
import { relocateDiagnostic } from "../../../../../util/diagnosticsUtils";
import { buildGuardFromType } from "../../../../../util/functions/buildGuardFromType";
import { CallMacro } from "../../../macro";

export const FlameworkCreateGuardMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("createGuard");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!firstType) Diagnostics.error(node, `Expected type argument`);

		const type = state.typeChecker.getTypeAtLocation(firstType);
		return relocateDiagnostic(node, buildGuardFromType, state, state.getSourceFile(node), type);
	},
};
