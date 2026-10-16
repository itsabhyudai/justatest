const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_FILE = path.join(__dirname, '..', 'data', 'tasks.db');

function openDatabase(file = process.env.DB_FILE || DEFAULT_DB_FILE) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

module.exports = { openDatabase };
