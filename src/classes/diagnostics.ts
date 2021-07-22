import ts from "typescript";

function createDiagnosticAtLocation(
	node: ts.Node,
	messageText: string,
	category: ts.DiagnosticCategory,
	file = ts.getSourceFileOfNode(node),
): ts.DiagnosticWithLocation {
	return {
		category,
		file,
		messageText,
		start: node.getStart(),
		length: node.getWidth(),
		code: " @flamework/core" as never,
	};
}

class DiagnosticError extends Error {
	constructor(public diagnostic: ts.DiagnosticWithLocation) {
		super(diagnostic.messageText as string);
	}
}

export class Diagnostics {
	static diagnostics = new Array<ts.DiagnosticWithLocation>();

	static addDiagnostic(diag: ts.DiagnosticWithLocation) {
		this.diagnostics.push(diag);
	}

	static createDiagnostic(node: ts.Node, category: ts.DiagnosticCategory, ...messages: string[]) {
		return createDiagnosticAtLocation(node, messages.join("\n"), category);
	}

	static relocate(diagnostic: ts.DiagnosticWithLocation, node: ts.Node): never {
		diagnostic.file = ts.getSourceFileOfNode(node);
		diagnostic.start = node.getStart();
		diagnostic.length = node.getWidth();
		throw new DiagnosticError(diagnostic);
	}

	static error(node: ts.Node, ...messages: string[]): never {
		throw new DiagnosticError(this.createDiagnostic(node, ts.DiagnosticCategory.Error, ...messages));
	}

	static warning(node: ts.Node, ...messages: string[]) {
		this.addDiagnostic(this.createDiagnostic(node, ts.DiagnosticCategory.Warning, ...messages));
	}

	static flush() {
		const diagnostics = this.diagnostics;
		this.diagnostics = [];

		return diagnostics;
	}
}
