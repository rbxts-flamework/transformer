export interface SerializedKind {
	// string, number, boolean, any, never, etc
	// can check name to find the intrinsic kind
	intrinsic: "intrinsic";

	// an intersection between types
	intersection: "intersection";

	// a union between types
	union: "union";

	// a class, containing all members and constructor is exposed as function
	class: "class";

	// an array, containing the element type
	array: "array";

	// a tuple, containing each element type
	tuple: "tuple";

	// a function, containing parameters and return types
	function: "function";

	// any type that does not fit the above or is an impl of any of the above types
	object: "object";
}

export interface SerializedType {
	kind: keyof SerializedKind;
	name: string;
}

export interface SerializedIntrinsic extends SerializedType {
	intrinsicName?: string;
}

export interface SerializedIntersection extends SerializedType {
	types?: SerializedType[];
}

export interface SerializedUnion extends SerializedType {
	types?: SerializedType[];
}

export interface SerializedClassLike {
	members?: SerializedClassMember[];
}

export interface SerializedClass extends SerializedType, SerializedClassLike {
	construct?: SerializedFunction;
	static?: SerializedClassLike;
}

export interface SerializedClassMember {
	name: string;
	type: SerializedType;
	visibility: "public" | "private" | "protected";
}

export interface SerializedArray extends SerializedType {
	elementType?: SerializedType;
}

export interface SerializedTuple extends SerializedType {
	elements?: SerializedType[];
	elementFlags?: SerializedTupleFlags[];
}

export interface SerializedFunction extends SerializedType {
	signatures?: SerializedFunctionSignature[];
}

export interface SerializedFunctionSignature {
	returnType?: SerializedType;
	parameters?: SerializedFunctionParameter[];
}

export interface SerializedFunctionParameter {
	name: string;
	isSpread: boolean;
	type: SerializedType;
}

// todo: impl object types?
export type SerializedObject = SerializedType;

export const enum SerializedTupleFlags {
	Rest = 1 << 0,
}
