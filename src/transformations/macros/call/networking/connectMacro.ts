import ts from "typescript";
import { Diagnostics } from "../../../../classes/diagnostics";
import { relocateDiagnostic } from "../../../../util/diagnosticsUtils";
import { f } from "../../../../util/factory";
import { buildGuardFromType } from "../../../../util/functions/buildGuardFromType";
import { CallMacro } from "../../macro";

export const NetworkingConnectMacro: CallMacro = {
	getSymbol(state) {
		const symbols = state.symbolProvider;
		const networking = symbols.findFile("@flamework/networking/events/types");
		if (!networking) return [];

		return [
			networking.getType("ServerReceiver").get("connect"),
			networking.getType("ClientReceiver").get("connect"),
		];
	},

	transform(state, node, macro) {
		const cb = node.arguments[0];
		const customGuards = node.arguments[1];

		if (!f.is.functionExpression(cb)) return state.transform(node);
		if (customGuards !== undefined && !f.is.array(customGuards))
			Diagnostics.error(customGuards, `Expected array or undefined`);

		if (!cb.parameters.some((x) => x.type !== undefined)) {
			return state.transform(node);
		}

		const undefinedId = f.identifier("undefined");
		const generatedGuards = new Array<ts.Expression>();
		for (let i = 0, index = 0; i < cb.parameters.length; index = ++i) {
			if (macro.symbol === macro.symbols[0]) {
				if (i === 0) continue;
				index = i - 1;
			}

			const param = cb.parameters[i];
			const customElement = customGuards?.elements[index];
			const isUndefinedElement =
				f.is.omitted(customElement) || (f.is.identifier(customElement) && customElement.text === "undefined");

			if (customElement && !isUndefinedElement) {
				generatedGuards[index] = customElement;
			} else if (param.type) {
				const tId = state.addFileImport(node.getSourceFile(), "@rbxts/t", "t");
				const type = state.typeChecker.getTypeAtLocation(param);
				const guard = relocateDiagnostic(param.type, buildGuardFromType, state, node, type);
				generatedGuards[index] = f.as(
					guard,
					f.referenceType(f.qualifiedNameType(tId, "check"), [param.type]),
					true,
				);
			} else {
				generatedGuards[index] = undefinedId;
			}
		}

		for (let i = generatedGuards.length - 1; i >= 0; i--) {
			if (generatedGuards[i] !== undefinedId) {
				break;
			}
			generatedGuards.pop();
		}

		return f.update.call(node, state.transformNode(node.expression), [state.transform(cb), generatedGuards]);
	},
};
