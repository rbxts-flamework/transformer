import ts from "typescript";
import { TransformState } from "../classes/transformState";
import { getNodeList } from "../util/functions/getNodeList";
import { transformStatement } from "./transformStatement";

export function transformStatementList(state: TransformState, statements: ReadonlyArray<ts.Statement>) {
	const result = new Array<ts.Statement>();

	for (const statement of statements) {
		const [newStatements, prereqs] = state.capture(() => transformStatement(state, statement));

		result.push(...prereqs);
		result.push(...getNodeList(newStatements));
	}

	return result;
}
