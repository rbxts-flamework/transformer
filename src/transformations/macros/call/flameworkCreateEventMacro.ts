import ts from "typescript";
import { Diagnostics } from "../../../classes/diagnostics";
import { f } from "../../../util/factory";
import { buildGuardFromType } from "../../../util/functions/buildGuardFromType";
import { CallMacro } from "../macro";

export const FlameworkCreateEventMacro: CallMacro = {
	getSymbol(state) {
		return state.symbolProvider.flamework.get("createEvent");
	},

	transform(state, node) {
		const signature = state.typeChecker.getResolvedSignature(node);
		const serverTypeArg = node.typeArguments?.[0];
		const clientTypeArg = node.typeArguments?.[1];
		if (!serverTypeArg) Diagnostics.error(node, `Missing ServerType type argument`);
		if (!clientTypeArg) Diagnostics.error(node, `Missing ClientType type argument`);
		if (!signature) Diagnostics.error(node, `Signature could not be resolved`);

		const serverType = state.typeChecker.getTypeAtLocation(serverTypeArg);
		const clientType = state.typeChecker.getTypeAtLocation(clientTypeArg);
		if (!serverType) Diagnostics.error(serverTypeArg, `Could not get type`);
		if (!clientType) Diagnostics.error(clientTypeArg, `Could not get type`);

		const networking = state.addFileImport(state.getSourceFile(node), "@rbxts/flamework", "Networking");

		const convertTypeToGuardArray = (type: ts.Type, source: ts.Node) => {
			const assignments = new Array<ts.PropertyAssignment>();

			for (const prop of type.getProperties()) {
				const propType = state.typeChecker.getTypeOfPropertyOfType(type, prop.name);
				if (!propType) Diagnostics.error(source, `Could not get property type ${prop.name}`);

				const propSource = prop.valueDeclaration ?? prop.declarations?.[0] ?? source;
				const callSignature = propType.getCallSignatures()[0];
				if (!callSignature) Diagnostics.error(propSource, `This type does not have a call signature`);

				const guards = new Array<ts.Expression>();
				for (const param of callSignature.parameters) {
					const paramType = state.typeChecker.getTypeOfSymbolAtLocation(param, node);
					guards.push(buildGuardFromType(state, state.getSourceFile(node), paramType));
				}
				assignments.push(f.propertyDeclaration(prop.name, guards));
			}

			return assignments;
		};

		return f.as(
			f.update.call(node, f.field(networking, "createEvent"), [
				f.object(convertTypeToGuardArray(serverType, serverTypeArg)),
				f.object(convertTypeToGuardArray(clientType, clientTypeArg)),
				...node.arguments,
			]),
			f.referenceType(f.qualifiedNameType(networking, "EventType"), [serverTypeArg, clientTypeArg]),
		);
	},
};
