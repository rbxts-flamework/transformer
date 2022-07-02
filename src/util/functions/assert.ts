/**
 * Asserts the truthiness of `value`, stops the debugger on failure.
 * @param value The value to check the truthiness of
 * @param message Optional. The message of the error
 */
export function assert(value: unknown, message?: string): asserts value {
	/* istanbul ignore if */
	if (!value) {
		debugger;
		throw new Error(
			`Assertion Failed! ${message ?? ""}` +
				"\nPlease submit a bug report here:" +
				"\nhttps://github.com/rbxts-flamework/core/issues",
		);
	}
}
