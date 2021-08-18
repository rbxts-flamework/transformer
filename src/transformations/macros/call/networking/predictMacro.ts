import { Diagnostics } from "../../../../classes/diagnostics";
import { f } from "../../../../util/factory";
import { CallMacro } from "../../macro";

export const NetworkingPredictMacro: CallMacro = {
	getSymbol(state) {
		const networking = state.symbolProvider.getFile("@flamework/networking/events/types");
		if (!networking) return [];

		return [networking.getType("ClientInterface").get("predict")];
	},

	transform(state, node) {
		if (!state.config.obfuscation) return node;

		const [eventName, ...args] = node.arguments;
		if (!eventName) Diagnostics.error(node, "Expected event name");
		if (!f.is.string(eventName)) Diagnostics.error(eventName, "Event name must be a string literal");

		return f.update.call(node, node.expression, [state.obfuscateText(eventName.text, "remotes"), ...args]);
	},
};
