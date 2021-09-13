import ts from "typescript";

export function addLeadingComment<T extends ts.Node | undefined>(node: T, text: string, multiline = false) {
	if (node === undefined) return node;
	return ts.addSyntheticLeadingComment(
		node,
		multiline ? ts.SyntaxKind.MultiLineCommentTrivia : ts.SyntaxKind.SingleLineCommentTrivia,
		text,
		true,
	) as T;
}
