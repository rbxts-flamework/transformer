import ts from "typescript";
import { Diagnostics } from "../../classes/diagnostics";
import { assert } from "../../classes/rojoResolver/util/assert";
import { getDeclarationOfType } from "./getDeclarationOfType";

export function getInstanceTypeFromType(file: ts.SourceFile, type: ts.Type) {
	assert(type.getProperty("_nominal_Instance"), "non instance type was passed into getInstanceTypeFromType");

	const diagnosticsLocation = getDeclarationOfType(type) ?? file;
	const nominalProperties = getNominalProperties(type);

	let specificType = type,
		specificTypeCount = 0;
	for (const property of nominalProperties) {
		const noNominalName = /_nominal_(.*)/.exec(property.name)?.[1];
		assert(noNominalName);

		const instanceSymbol = type.checker.resolveName(noNominalName, undefined, ts.SymbolFlags.Type, false);
		if (!instanceSymbol) continue;

		const instanceDeclaration = instanceSymbol.declarations?.[0];
		if (!instanceDeclaration) continue;

		const instanceType = type.checker.getTypeAtLocation(instanceDeclaration);
		const subNominalProperties = getNominalProperties(instanceType);

		if (subNominalProperties.length > specificTypeCount) {
			specificType = instanceType;
			specificTypeCount = subNominalProperties.length;
		}
	}

	// intersection between two nominal types?
	for (const property of nominalProperties) {
		if (!specificType.getProperty(property.name)) {
			Diagnostics.error(diagnosticsLocation, `Intersection between nominal types is forbidden.`);
		}
	}

	return specificType;
}

function getNominalProperties(type: ts.Type) {
	return type.getProperties().filter((x) => x.name.startsWith("_nominal_"));
}
