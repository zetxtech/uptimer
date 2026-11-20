import { createRequire } from 'node:module';

export const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

export function sqliteD1(database: InstanceType<typeof DatabaseSync>): D1Database {
  function prepare(sql: string, args: unknown[] = []): D1PreparedStatement {
    const params = /\?\d+/.test(sql)
      ? [Object.fromEntries(args.map((value, index) => [`?${index + 1}`, value]))]
      : args;
    return {
      bind: (...values: unknown[]) => prepare(sql, values),
      run: async () => ({
        meta: { changes: Number(database.prepare(sql).run(...params).changes) },
      }),
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      first: async () => database.prepare(sql).get(...params) ?? null,
      // Drizzle reads `RETURNING` clauses through `raw()`, which yields rows as value arrays.
      raw: async () =>
        database
          .prepare(sql)
          .all(...params)
          .map((row) => Object.values(row)),
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare,
    batch: async (statements: D1PreparedStatement[]) => {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
}
