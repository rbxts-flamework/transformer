/**
 * Replace a value (in-place) in an array.
 */
export function replaceValue<T>(arr: Array<T>, needle: T, value: T) {
	const index = arr.lastIndexOf(needle);
	if (index === -1) return;
	arr[index] = value;
}
