import { readFileSync, writeFileSync } from "node:fs";

const topbarPath = "src/shell/Topbar.tsx";
let topbar = readFileSync(topbarPath, "utf8");

const teamLogoutUrl =
  "https://argos-mvp-5sz-pages.cloudflareaccess.com/cdn-cgi/access/logout";

topbar = topbar
  .replaceAll('href="/cdn-cgi/access/logout"', `href="${teamLogoutUrl}"`)
  .replaceAll("href='/cdn-cgi/access/logout'", `href="${teamLogoutUrl}"`);

writeFileSync(topbarPath, topbar, "utf8");

console.log("Logout atualizado para Cloudflare Access team domain:");
console.log(teamLogoutUrl);
