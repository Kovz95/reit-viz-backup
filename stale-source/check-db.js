const Database = require("better-sqlite3");
const db = new Database("data/reit-viz.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables.map(t => t.name));
for (const t of tables) {
  const count = db.prepare("SELECT COUNT(*) as c FROM [" + t.name + "]").get();
  console.log(t.name, "rows:", count.c);
  if (t.name.toLowerCase().includes("workspace")) {
    const rows = db.prepare("SELECT * FROM [" + t.name + "] LIMIT 2").all();
    for (const r of rows) console.log(JSON.stringify(r).substring(0, 300));
  }
}
