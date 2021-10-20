import { ts } from "typescript";

export type BaseDecoratorInfo = ServiceDecorator | ControllerDecorator | CustomDecorator;
export type DecoratorInfo = BaseDecoratorInfo | DecoratorWithNodes;

interface BaseDecorator {
	type: "Base";
	name: string;
	internalId: string;
	isFlameworkDecorator: boolean;
}

interface DecoratorWithNodes extends BaseDecorator {
	type: "WithNodes";
	symbol: ts.Symbol;
	declaration: ts.Node;
	arguments: ts.Node[];
}

interface ServiceDecorator extends BaseDecorator {
	name: "Service";
}

interface ControllerDecorator extends BaseDecorator {
	name: "Controller";
}

type CustomDecorator = BaseDecorator;
