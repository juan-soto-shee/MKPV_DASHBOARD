import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync(new URL("./", import.meta.url))
  .filter((name) => name.endsWith(".js") && name !== "checkSyntax.js")
  .map((name) => `demo_data_generator/${name}`)
  .concat(["plantview-admin/modules/demoGenerator.js", "js/firestoreService.js", "js/modeling.js"]);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Sintaxis válida en ${files.length} archivos.`);
