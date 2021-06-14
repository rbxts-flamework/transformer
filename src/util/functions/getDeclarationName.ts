import ts from "typescript";
import { f } from "../factory";

/**
 * Calculates a name, including all named ancestors, such as Enum.Material.Air
 * @param node The node to retrieve the name of
 */
export function getDeclarationName(node: ts.NamedDeclaration): string {
	if (!f.is.identifier(node.name)) return "??";
	let name = node.name.text;
	for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
		if (ts.isNamedDeclaration(parent)) {
			name = parent.name.getText() + "." + name;
		}
	}
	return name;
}
