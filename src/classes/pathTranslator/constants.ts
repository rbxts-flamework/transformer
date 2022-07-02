import path from "path";

export const PACKAGE_ROOT = path.join(__dirname, "..", "..", "..");

// intentionally not using PACKAGE_ROOT because playground has webpack issues
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
export const PKG_VERSION: string = require("../../../package.json").version;

export const TS_EXT = ".ts";
export const TSX_EXT = ".tsx";
export const D_EXT = ".d";
export const LUA_EXT = ".lua";

export const INDEX_NAME = "index";
export const INIT_NAME = "init";

export enum ProjectType {
	Game = "game",
	Model = "model",
	Package = "package",
}
