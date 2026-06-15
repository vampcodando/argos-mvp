import { readFileSync, writeFileSync } from "node:fs";

const packagePath = "package.json";
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

pkg.scripts = pkg.scripts || {};
pkg.scripts["local:ollama-bridge"] = "node tools/argos-local-ollama-bridge.mjs";

writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

console.log("Script local:ollama-bridge adicionado ao package.json.");
