import { readFileSync, writeFileSync } from "node:fs";

const headersPath = "public/_headers";
let headers = readFileSync(headersPath, "utf8");

headers = headers.replace(
  "connect-src 'self';",
  "connect-src 'self' http://127.0.0.1:8787 http://localhost:8787;"
);

writeFileSync(headersPath, headers, "utf8");

console.log("CSP atualizada para permitir somente a ponte local ARGOS/Ollama.");
