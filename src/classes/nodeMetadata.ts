import ts from "typescript";
import { f } from "../util/factory";
import { TransformState } from "./transformState";

export class NodeMetadata {
	private set = new Set<string>();
	private symbols = new Map<string, Array<ts.Symbol>>();
	private types = new Map<string, Array<ts.Type>>();
	private trace = new Map<string | ts.Symbol | ts.Type, ts.Node>();

	private parseText(text: string, node: ts.Node) {
		for (const name of text.trim().replace(/\s+/, " ").split(" ")) {
			this.set.add(name);
			this.trace.set(name, node);
		}
	}

	private parseMetadata(state: TransformState, tag: ts.JSDocTag) {
		if (typeof tag.comment === "string") {
			this.parseText(tag.comment, tag);
		} else if (tag.comment) {
			for (const comment of tag.comment) {
				if (ts.isJSDocLinkLike(comment)) {
					if (!comment.name) continue;

					const symbol = state.getSymbol(comment.name);
					if (!symbol) continue;

					const type =
						symbol.flags & ts.SymbolFlags.TypeAlias
							? state.typeChecker.getDeclaredTypeOfSymbol(symbol)
							: state.typeChecker.getTypeAtLocation(comment.name);

					let symbols = this.symbols.get(comment.text);
					let types = this.types.get(comment.text);
					if (!types) this.types.set(comment.text, (types = []));
					if (!symbols) this.symbols.set(comment.text, (symbols = []));

					symbols.push(symbol);
					types.push(type);
					this.trace.set(symbol, comment);
					this.trace.set(type, comment);
				} else {
					this.parseText(comment.text, comment);
				}
			}
		}
	}

	private parse(state: TransformState, node: ts.Node) {
		const tags = ts.getJSDocTags(node);
		for (const tag of tags) {
			if (tag.tagName.text === "metadata") {
				this.parseMetadata(state, tag);
			}
		}

		if (node.decorators) {
			for (const decorator of node.decorators) {
				const expression = decorator.expression;
				const symbol = state.getSymbol(f.is.call(expression) ? expression.expression : expression);
				if (!symbol || !symbol.declarations) continue;

				for (const declaration of symbol.declarations) {
					this.parse(state, declaration);
				}
			}
		}

		// Interfaces are able to request metadata for their own property/methods.
		if (ts.isClassElement(node) && node.name) {
			const name = ts.getNameFromPropertyName(node.name);
			if (name && ts.isClassLike(node.parent)) {
				const implementNodes = ts.getEffectiveImplementsTypeNodes(node.parent);
				if (implementNodes) {
					for (const implement of implementNodes) {
						const symbol = state.getSymbol(implement.expression);
						const member = symbol?.members?.get(ts.escapeLeadingUnderscores(name));
						if (member && member.declarations) {
							for (const declaration of member.declarations) {
								this.parse(state, declaration);
							}
						}
					}
				}
			}
		}
	}

	constructor(state: TransformState, node: ts.Node) {
		this.parse(state, node);
	}

	isRequested(metadata: string) {
		if (this.set.has(`~${metadata}`)) {
			return false;
		}

		return this.set.has(metadata) || this.set.has("*");
	}

	getSymbol(key: string) {
		return this.symbols.get(key);
	}

	getType(key: string) {
		return this.types.get(key);
	}

	getTrace(name: string | ts.Symbol | ts.Type) {
		return this.trace.get(name);
	}
}
