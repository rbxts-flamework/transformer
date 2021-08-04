import ts from "typescript";
import { Diagnostics } from "../../../../classes/diagnostics";
import { relocateDiagnostic } from "../../../../util/diagnosticsUtils";
import { f } from "../../../../util/factory";
import { buildGuardFromType } from "../../../../util/functions/buildGuardFromType";
import { CallMacro } from "../../macro";

export const NetworkingConnectMacro: CallMacro = {
	getSymbol(state) {
		const symbols = state.symbolProvider;
		const networking = symbols.networkingImpl;
		if (!networking) return [];

		return [networking.getType("ServerHandler").get("connect"), networking.getType("ClientHandler").get("connect")];
	},

	transform(state, node, macro) {
		const event = node.arguments[0];
		const cb = node.arguments[1];
		const customGuards = node.arguments[2];

		if (!f.is.string(event)) Diagnostics.error(event, `Expected string`);
		if (!f.is.functionExpression(cb)) Diagnostics.error(cb, `Expected function expression`);

		if (customGuards !== undefined && !f.is.array(customGuards))
			Diagnostics.error(customGuards, `Expected array or undefined`);

		if (!cb.parameters.some((x) => x.type !== undefined)) {
			if (state.config.obfuscation) {
				const args: f.ConvertableExpression[] = [state.obfuscateText(event.text, "remotes"), cb];
				if (customGuards) args.push(customGuards);
				return state.transform(f.update.call(node, node.expression, args));
			} else {
				return state.transform(node);
			}
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
				const type = state.typeChecker.getTypeAtLocation(param.type);
				generatedGuards[index] = relocateDiagnostic(
					param.type,
					buildGuardFromType,
					state,
					state.getSourceFile(node),
					type,
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

		return f.update.call(node, node.expression, [
			state.obfuscateText(event.text, "remotes"),
			state.transform(cb),
			generatedGuards,
		]);
	},
};
