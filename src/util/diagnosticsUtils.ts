import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";

type ValueOrDiagnostic<T> =
	| { success: true; diagnostic?: ts.DiagnosticWithLocation; value: T }
	| { success: false; diagnostic: ts.DiagnosticWithLocation; value?: T };

export function captureDiagnostic<T, A extends unknown[]>(cb: (...args: A) => T, ...args: A): ValueOrDiagnostic<T> {
	try {
		return { success: true, value: cb(...args) };
	} catch (e) {
		if ("diagnostic" in e) {
			return { success: false, diagnostic: e.diagnostic };
		}
		throw e;
	}
}

export function relocateDiagnostic<T, A extends unknown[]>(node: ts.Node, cb: (...args: A) => T, ...params: A): T {
	const result = captureDiagnostic(cb, ...params);

	if (result.success) {
		return result.value;
	}

	Diagnostics.relocate(result.diagnostic, node);
}

export function catchDiagnostic<T>(fallback: T, cb: () => T): T {
	const result = captureDiagnostic(cb);

	if (!result.success) {
		Diagnostics.addDiagnostic(result.diagnostic);
	}

	return result.value ?? fallback;
}
