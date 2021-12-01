import { DecoratorInfo } from "./decorators";

export interface ClassInfo {
	symbol: ts.Symbol;
	internalId: string;
	node: ts.Node;
	name: string;
	decorators: DecoratorInfo[];
}
