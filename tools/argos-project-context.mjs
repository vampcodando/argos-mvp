import {
  buildProjectContext,
  openProjectMemoryDatabase,
} from "./lib/argos-project-memory-core.mjs";

function main() {
  const projectId = String(process.argv[2] || "").trim();
  const query = process.argv.slice(3).join(" ").trim();

  if (!projectId || !query) {
    console.error(
      "Uso: node tools/argos-project-context.mjs <projectId> <consulta>"
    );
    process.exitCode = 1;
    return;
  }

  const db = openProjectMemoryDatabase();

  try {
    console.log(
      JSON.stringify(
        buildProjectContext(db, projectId, query),
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          service: "argos-project-context",
          error:
            error instanceof Error
              ? error.message
              : "Erro desconhecido.",
        },
        null,
        2
      )
    );

    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();