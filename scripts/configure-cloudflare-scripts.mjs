import { readFileSync, writeFileSync } from "node:fs";

const packagePath = "package.json";
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

pkg.scripts = {
  ...pkg.scripts,
  "cf:whoami": "wrangler whoami",
  "cf:project:create": "wrangler pages project create argos-mvp --production-branch=main",
  "deploy": "npm run build && wrangler pages deploy dist --project-name=argos-mvp --branch=main",
  "deploy:preview": "npm run build && wrangler pages deploy dist --project-name=argos-mvp --branch=preview",
  "delploy": "npm run deploy"
};

writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("package.json atualizado com scripts de deploy Cloudflare.");
