import { readFileSync, writeFileSync } from "node:fs";

const bridgePath = "tools/argos-local-ollama-bridge.mjs";
let code = readFileSync(bridgePath, "utf8");

code = code.replace(
  `"access-control-max-age": "600",`,
  `"access-control-max-age": "600",
    "access-control-allow-private-network": "true",
    "vary": "Origin, Access-Control-Request-Private-Network",`
);

code = code.replace(
  `"access-control-allow-headers": "content-type,accept",`,
  `"access-control-allow-headers": "content-type,accept,access-control-request-private-network",`
);

writeFileSync(bridgePath, code, "utf8");

console.log("Bridge local atualizado com suporte a Private Network Access.");
