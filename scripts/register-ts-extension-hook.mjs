import { register } from "node:module";

// Node's type stripper still requires a file extension on relative imports.
// This hook is test-only so application code can keep normal extensionless imports.
register(new URL("./ts-extension-resolve-hook.mjs", import.meta.url).href, import.meta.url);
