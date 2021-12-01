import {
	SerializedArray,
	SerializedClass,
	SerializedClassLike,
	SerializedClassMember,
	SerializedFunction,
	SerializedFunctionParameter,
	SerializedFunctionSignature,
	SerializedIntersection,
	SerializedTuple,
	SerializedType,
	SerializedUnion,
} from "./types";

const SEPARATOR = "-";
enum SerializedKindEnum {
	intrinsic,
	intersection,
	union,
	class,
	array,
	tuple,
	function,
	object,
}

export function serializedTypeToString(type: SerializedType) {
	const backrefs = new Map<SerializedType, number>();
	let backrefId = 0;
	return serializedTypeToString(type);

	/**
	 * Format:
	 * separator/sep = - (after every entry)
	 * version name kind type
	 */
	function serializedTypeToString(type: SerializedType) {
		const typeBackref = backrefs.get(type);
		if (typeBackref) return `!${typeBackref}`;

		backrefId++;
		backrefs.set(type, backrefId);

		let result = "";

		result += type.name;
		result += SEPARATOR;
		result += SerializedKindEnum[type.kind];
		if (type.kind !== "intrinsic" && type.kind !== "object") result += SEPARATOR;

		if (type.kind === "array") {
			result += serializedArrayToString(type);
		} else if (type.kind === "tuple") {
			result += serializedTupleToString(type);
		} else if (type.kind === "function") {
			result += serializedFunctionToString(type);
		} else if (type.kind === "intersection" || type.kind === "union") {
			result += serializedUnionOrIntersectionToString(type);
		} else if (type.kind === "class") {
			result += serializedClassToString(type);
		}

		return result;
	}

	// Format: element
	function serializedArrayToString(type: SerializedArray) {
		return serializedTypeToString(type.elementType!);
	}

	// Format: len [elementFlags elementType]
	function serializedTupleToString(type: SerializedTuple) {
		let result = "";

		result += type.elements!.length;
		type.elements?.forEach((value, index) => {
			result += SEPARATOR;
			result += type.elementFlags![index];
			result += SEPARATOR;
			result += serializedTypeToString(value);
		});

		return result;
	}

	// Format: name isSpread type
	function serializedFunctionParameterToString(type: SerializedFunctionParameter) {
		let result = "";

		result += type.name;
		result += SEPARATOR;
		result += type.isSpread ? 1 : 0;
		result += SEPARATOR;
		result += serializedTypeToString(type.type);

		return result;
	}

	// Format: returnTypeExists returnType parameterLen parameters
	function serializedFunctionSignatureToString(type: SerializedFunctionSignature) {
		let result = "";

		result += type.returnType ? 1 : 0;
		if (type.returnType) {
			result += SEPARATOR;
			result += serializedTypeToString(type.returnType);
		}

		result += SEPARATOR;
		result += type.parameters!.length;
		for (const parameter of type.parameters!) {
			result += SEPARATOR;
			result += serializedFunctionParameterToString(parameter);
		}

		return result;
	}

	// Format: signatureLen signature
	function serializedFunctionToString(type: SerializedFunction) {
		let result = "";

		result += type.signatures!.length;
		for (const signature of type.signatures!) {
			result += SEPARATOR;
			result += serializedFunctionSignatureToString(signature);
		}

		return result;
	}

	// Format: len types
	function serializedUnionOrIntersectionToString(type: SerializedUnion | SerializedIntersection) {
		let result = "";

		result += type.types!.length;
		for (const subtype of type.types!) {
			result += SEPARATOR;
			result += serializedTypeToString(subtype);
		}

		return result;
	}

	// Format: name visibility type
	function serializedClassMemberToString(type: SerializedClassMember) {
		let result = "";

		result += type.name;
		result += SEPARATOR;
		result += type.visibility;
		result += SEPARATOR;
		result += serializedTypeToString(type.type);

		return result;
	}

	// Format: membersLen members
	function serializedClassLikeToString(type: SerializedClassLike) {
		let result = "";

		result += type.members!.length;
		for (const member of type.members!) {
			result += SEPARATOR;
			result += serializedClassMemberToString(member);
		}

		return result;
	}

	// Format: (serializedClassLike) static constructExists construct
	function serializedClassToString(type: SerializedClass) {
		let result = serializedClassLikeToString(type);

		result += SEPARATOR;
		result += serializedClassLikeToString(type.static!);
		result += SEPARATOR;
		result += type.construct ? 1 : 0;
		if (type.construct) {
			result += SEPARATOR;
			result += serializedTypeToString(type.construct);
		}

		return result;
	}
}
