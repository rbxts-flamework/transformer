import ts from "typescript";
import { Diagnostics } from "../../../../classes/diagnostics";
import { f } from "../../../../util/factory";
import { assert } from "../../../../util/functions/assert";
import { getGenericIdMap } from "../../../../util/functions/getGenericIdMap";
import { getNodeUid } from "../../../../util/uid";
import { CallMacro } from "../../macro";

function formatOrdinal(num: number) {
	return ["1st", "2nd", "3rd"][num - 1] ?? `${num}th`;
}

export const GenericIdMacro: CallMacro = {
	getSymbol(state) {
		return [...getGenericIdMap(state).keys()];
	},

	transform(state, node, { symbol }) {
		const genericInfo = getGenericIdMap(state).get(symbol);
		assert(genericInfo);

		const argument = node.arguments[genericInfo.index];

		if (!node.typeArguments?.[0]) {
			if (!genericInfo.optional && !argument) {
				Diagnostics.error(
					node.expression,
					`This macro requires you to specify a type argument.`,
					`You can also specify the ID (${formatOrdinal(genericInfo.index + 1)} parameter)`,
				);
			}
		} else if (!argument) {
			const id = getNodeUid(state, node.typeArguments[0]);
			const parameters = new Array<ts.Expression>();

			for (let i = 0; i < genericInfo.index; i++) {
				parameters.push(node.arguments[i] ? state.transformNode(node.arguments[i]) : f.nil());
			}

			parameters.push(f.string(id));
			return f.update.call(node, state.transformNode(node.expression), parameters);
		}

		return state.transform(node);
	},
};
