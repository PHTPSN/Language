import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Database, Statement } from "./repository";

const databasePath =
  process.env.LANGUAGE_LAB_DB_PATH ||
  join(process.cwd(), ".local", "language-lab.sqlite");

let connection: DatabaseSync | undefined;
const synchronousRuns = new WeakMap<Statement, () => { meta: { changes: number } }>();

function openConnection(): DatabaseSync {
  if (connection) return connection;
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS learners (
      id TEXT PRIMARY KEY NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Local Node previews apply the same append-only schema migrations as D1.
  sqlite.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)");
  for (const file of readdirSync(join(process.cwd(), "drizzle")).filter(f => f.endsWith(".sql")).sort()) {
    if (sqlite.prepare("SELECT name FROM local_migrations WHERE name = ?").get(file)) continue;
    // The legacy preview created learners before migration tracking existed.
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      if (!file.startsWith("0000_")) sqlite.exec(readFileSync(join(process.cwd(), "drizzle", file), "utf8"));
      sqlite.prepare("INSERT INTO local_migrations(name) VALUES (?)").run(file);
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); sqlite.close(); throw error; }
  }
  connection = sqlite;
  return sqlite;
}

/** Adapt Node's synchronous SQLite API to the async D1-shaped repository API. */
export function nodeDatabase(): Database {
  const sqlite = openConnection();
  return {
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => {
          const run = synchronousRuns.get(statement);
          if (!run) throw new Error("Statement belongs to another database adapter.");
          return run();
        });
        sqlite.exec("COMMIT"); return results;
      }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    prepare(query: string): Statement {
      const statement = sqlite.prepare(query);
      let parameters: (string | number)[] = [];
      const run = () => ({ meta: { changes: Number(statement.run(...parameters).changes) } });
      const adapter: Statement = {
        bind(...values: (string | number)[]) {
          parameters = values;
          return this;
        },
        async run() {
          return run();
        },
        async first<T>() {
          return (statement.get(...parameters) as T | undefined) ?? null;
        },
        async all<T>() { return { results: statement.all(...parameters) as T[] }; },
      };
      synchronousRuns.set(adapter, run);
      return adapter;
    },
  };
}

export function localDatabasePath() {
  return databasePath;
}
