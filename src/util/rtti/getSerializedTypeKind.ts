import ts from "typescript";
import { SerializedKind } from "./types";

export function getSerializedTypeKind(type: ts.Type): keyof SerializedKind {
	if (type.flags & ts.TypeFlags.Intrinsic) {
		return "intrinsic";
	}

	if (type.isIntersection()) {
		return "intersection";
	}

	if (type.isUnion()) {
		return "union";
	}

	if (type.isClass()) {
		return "class";
	}

	if (type.getCallSignatures().length > 0) {
		return "function";
	}

	if (type.checker.isTupleType(type)) {
		return "tuple";
	}

	if (type.checker.isArrayType(type)) {
		return "array";
	}

	// if (type.isClassOrInterface()) {
	// 	return "object";
	// }

	console.log("found object", type.checker.typeToString(type));

	for (const flag of Object.values(ts.TypeFlags)) {
		if (typeof flag === "number") {
			if (type.flags & flag) {
				console.log("flag:", ts.TypeFlags[flag]);
			}
		}
	}

	return "object";
}
