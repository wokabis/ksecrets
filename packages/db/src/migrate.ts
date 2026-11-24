import { initializeNodeDatabase } from "./node";

async function main() {
  const db = await initializeNodeDatabase();
  const rows = await db.selectFrom("settings").select("key").execute();
  console.log(`Database initialized with ${rows.length} settings.`);
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
