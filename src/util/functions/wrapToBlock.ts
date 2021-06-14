import ts from "typescript";

export function wrapToBlock(nodes: ts.Statement | ts.Statement[]): ts.Statement {
	if (Array.isArray(nodes)) {
		if (nodes.length === 1) {
			return nodes[0];
		} else {
			return ts.factory.createBlock(nodes);
		}
	}
	return nodes;
}
