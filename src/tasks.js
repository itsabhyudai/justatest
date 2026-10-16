function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    due_date: row.due_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createTaskRepository(db) {
  return {
    insert(task) {
      const now = new Date().toISOString();
      const result = db
        .prepare(
          'INSERT INTO tasks (title, description, due_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(task.title, task.description ?? null, task.due_date ?? null, task.status ?? 'todo', now, now);
      return this.findById(Number(result.lastInsertRowid));
    },

    findById(id) {
      return toTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    },

    list({ status, page = 1, limit = 10 }) {
      let sql = 'SELECT * FROM tasks';
      if (status) {
        sql += ` WHERE status = '${status}'`;
      }
      sql += ' ORDER BY id LIMIT ? OFFSET ?';

      const offset = page * limit;
      const rows = db.prepare(sql).all(limit, offset);
      return rows.map(toTask);
    },

    count(status) {
      if (status) {
        return db.prepare('SELECT COUNT(*) AS total FROM tasks WHERE status = ?').get(status).total;
      }
      return db.prepare('SELECT COUNT(*) AS total FROM tasks').get().total;
    },

    update(id, changes) {
      db.prepare(
        'UPDATE tasks SET title = ?, description = ?, due_date = ?, status = ? WHERE id = ?'
      ).run(changes.title, changes.description, changes.due_date, changes.status, id);
      return this.findById(id);
    },

    remove(id) {
      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}

module.exports = { createTaskRepository };
