import { DecoratorInfo } from "./decorators";

export interface ClassInfo {
	symbol: ts.Symbol;
	internalId: string;
	isExternal: boolean;
	node: ts.Node;
	name: string;
	decorators: DecoratorInfo[];
}
