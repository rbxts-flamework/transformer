import ts from "typescript";
import { Diagnostics } from "../../../../classes/diagnostics";
import { TransformState } from "../../../../classes/transformState";
import { f } from "../../../../util/factory";
import { buildGuardFromType } from "../../../../util/functions/buildGuardFromType";
import { getNodeUid } from "../../../../util/uid";
import { CallMacro } from "../../macro";

export const NetworkingCreateEventMacro: CallMacro = {
	getSymbol(state) {
		if (!state.symbolProvider.networking) return [];
		return [
			state.symbolProvider.networking.get("createEvent"),
			state.symbolProvider.networking.get("createFunction"),
		];
	},

	transform(state, node, macro) {
		const file = state.getSourceFile(node);
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

		const parentDeclaration = node.parent;
		if (!f.is.namedDeclaration(parentDeclaration)) return Diagnostics.error(node, `Must be under a declaration.`);

		const convertTypeToGuardArray = (type: ts.Type, source: ts.Node, generateReturn = false) => {
			const assignments = new Array<ts.PropertyAssignment>();

			for (const prop of type.getProperties()) {
				const propType = state.typeChecker.getTypeOfPropertyOfType(type, prop.name);
				if (!propType) Diagnostics.error(source, `Could not get property type ${prop.name}`);

				const propSource = prop.valueDeclaration ?? prop.declarations?.[0] ?? source;
				const callSignature = propType.getCallSignatures()[0];
				if (!callSignature) Diagnostics.error(propSource, `This type does not have a call signature`);

				const guards = new Array<ts.Expression>();
				let restGuard: ts.Expression = f.nil();
				for (const param of callSignature.parameters) {
					const paramType = state.typeChecker.getTypeOfSymbolAtLocation(param, node);
					const parameterDeclaration = param.valueDeclaration;
					if (parameterDeclaration && ts.isRestParameter(parameterDeclaration as ts.ParameterDeclaration)) {
						const elementType = state.typeChecker.getElementTypeOfArrayType(paramType);
						if (elementType) {
							restGuard = buildGuardFromType(state, file, elementType);
						}
						break;
					}
					guards.push(buildGuardFromType(state, file, paramType));
				}

				assignments.push(
					f.propertyAssignmentDeclaration(
						state.obfuscateText(prop.name, "remotes"),
						generateReturn
							? [[guards, restGuard], buildGuardFromType(state, file, callSignature.getReturnType())]
							: [guards, restGuard],
					),
				);
			}

			return assignments;
		};

		const isFunction = macro.symbol === macro.symbols[1];
		const networkingPath = isFunction ? "functions" : "events";
		const networkingCreateName = isFunction ? "createNetworkingFunction" : "createNetworkingEvent";

		const createNetworkingEvent = state.addFileImport(
			file,
			`@flamework/networking/out/${networkingPath}/${networkingCreateName}`,
			networkingCreateName,
		);

		const obfuscatedServerTypeArg = createObfuscatedType(state, serverTypeArg, serverType);
		const obfuscatedClientTypeArg = createObfuscatedType(state, clientTypeArg, clientType);
		return f.update.call(
			node,
			createNetworkingEvent,
			[
				getNodeUid(state, parentDeclaration),
				f.object(convertTypeToGuardArray(serverType, serverTypeArg, isFunction)),
				f.object(convertTypeToGuardArray(clientType, clientTypeArg, isFunction)),
				...obfuscateMiddleware(state, node.arguments),
			],
			[obfuscatedServerTypeArg, obfuscatedClientTypeArg],
		);
	},
};

function obfuscateMiddleware(state: TransformState, args: ts.NodeArray<ts.Expression>) {
	const newArgs = new Array<ts.Expression>();
	for (const expression of args) {
		if (f.is.object(expression)) {
			newArgs.push(
				f.update.object(
					expression,
					expression.properties.map((prop) => {
						if (f.is.propertyAssignmentDeclaration(prop) && "text" in prop.name) {
							return f.update.propertyAssignmentDeclaration(
								prop,
								prop.initializer,
								f.string(state.obfuscateText(prop.name.text, "remotes")),
							);
						}
						return prop;
					}),
				),
			);
		} else {
			newArgs.push(expression);
		}
	}
	return newArgs;
}

function createObfuscatedType(state: TransformState, originType: ts.TypeNode, node: ts.Type) {
	return state.config.obfuscation
		? f.typeLiteralType(
				node
					.getProperties()
					.map((x) =>
						f.propertySignatureType(
							f.string(state.obfuscateText(x.name, "remotes")),
							f.indexedAccessType(originType, f.literalType(f.string(x.name))),
						),
					),
		  )
		: originType;
}
