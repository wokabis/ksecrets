import { initializeNodeDatabase } from "./node";

async function main() {
  const db = await initializeNodeDatabase();
  const settings = await db.selectFrom("settings").select(["key", "value"]).execute();
  console.log("Seeded defaults:");
  for (const s of settings) console.log(`  ${s.key} = ${s.value}`);
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
