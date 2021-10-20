/* eslint-disable @typescript-eslint/no-explicit-any */
import ts from "typescript";
import { Diagnostics } from "../classes/diagnostics";

type ValueOrDiagnostic<T> =
	| { success: true; diagnostic?: ts.DiagnosticWithLocation; value: T }
	| { success: false; diagnostic: ts.DiagnosticWithLocation; value?: T };

export function captureDiagnostic<T, A extends unknown[]>(cb: (...args: A) => T, ...args: A): ValueOrDiagnostic<T> {
	try {
		return { success: true, value: cb(...args) };
	} catch (e: any) {
		if ("diagnostic" in e) {
			/// Temporary workaround for 1.1.1
			if (
				ts.version.startsWith("1.1.1") &&
				!ts.version.startsWith("1.1.1-dev") &&
				!(globalThis as { RBXTSC_DEV?: boolean }).RBXTSC_DEV
			) {
				e.diagnostic = undefined;
				throw e;
			}

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
