import { Diagnostics } from "../../../../../classes/diagnostics";
import { relocateDiagnostic } from "../../../../../util/diagnosticsUtils";
import { f } from "../../../../../util/factory";
import { buildGuardFromType } from "../../../../../util/functions/buildGuardFromType";
import { CallMacro } from "../../../macro";

export const FlameworkCreateGuardMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("createGuard");
	},

	transform(state, node) {
		const firstType = node.typeArguments?.[0];
		if (!firstType) Diagnostics.error(node, `Expected type argument`);

		const tId = state.addFileImport(node.getSourceFile(), "@rbxts/t", "t");
		const type = state.typeChecker.getTypeAtLocation(firstType);
		const guard = relocateDiagnostic(node, buildGuardFromType, state, firstType, type);
		return f.as(guard, f.referenceType(f.qualifiedNameType(tId, "check"), [firstType]), true);
	},
};
