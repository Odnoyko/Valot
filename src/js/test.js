import { setupDatabase, executeQuery } from './dbinitialisation.js';

export function showAllData() {
  const conn = setupDatabase();
  const tables = ['Project', 'Task'];

  for (const table of tables) {
    const result = executeQuery(conn, `SELECT * FROM ${table}`);
    const cols = result.get_n_columns();
    const rows = result.get_n_rows();

    const names = [];
    for (let c = 0; c < cols; c++) {
      names.push(result.get_column_title(c));
    }

    for (let r = 0; r < rows; r++) {
      const values = [];
      for (let c = 0; c < cols; c++) {
        values.push(result.get_value_at(r, c));
      }
    }
  }
}

