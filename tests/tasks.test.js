const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

let server;
let base;
let db;

before(async () => {
  db = openDatabase(':memory:');
  server = createApp({ db });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM tasks');
});

function request(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return fetch(base + path, init);
}

async function createTask(overrides = {}) {
  const res = await request('POST', '/tasks', { title: 'Write tests', ...overrides });
  return (await res.json()).data;
}

test('creates a task with defaults and returns 201', async () => {
  const res = await request('POST', '/tasks', { title: 'Buy milk' });
  assert.equal(res.status, 201);

  const { data } = await res.json();
  assert.equal(data.title, 'Buy milk');
  assert.equal(data.status, 'todo');
  assert.equal(data.description, null);
  assert.equal(data.due_date, null);
  assert.ok(data.id);
});

test('creates a task with all fields', async () => {
  const task = await createTask({
    title: 'Ship release',
    description: 'Tag v1.0 and publish',
    due_date: '2026-12-01',
    status: 'in_progress',
  });
  assert.equal(task.description, 'Tag v1.0 and publish');
  assert.equal(task.due_date, '2026-12-01');
  assert.equal(task.status, 'in_progress');
});

test('rejects a missing title with 422', async () => {
  const res = await request('POST', '/tasks', { description: 'no title here' });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, 'validation_failed');
  assert.equal(body.error.details[0].field, 'title');
});

test('rejects a whitespace-only title', async () => {
  const res = await request('POST', '/tasks', { title: '     ' });
  assert.equal(res.status, 422);
});

test('rejects an unknown status on create', async () => {
  const res = await request('POST', '/tasks', { title: 'x', status: 'maybe' });
  assert.equal(res.status, 422);
});

test('rejects a malformed due date', async () => {
  const res = await request('POST', '/tasks', { title: 'x', due_date: '12/01/2026' });
  assert.equal(res.status, 422);
});

test('rejects a calendar-impossible due date', async () => {
  const res = await request('POST', '/tasks', { title: 'x', due_date: '2026-02-31' });
  assert.equal(res.status, 422);
});

test('returns 400 for invalid JSON', async () => {
  const res = await request('POST', '/tasks', '{"title": ');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'invalid_json');
});

test('returns 422 when the body is not an object', async () => {
  const res = await request('POST', '/tasks', ['not', 'an', 'object']);
  assert.equal(res.status, 422);
});

test('gets a task by id', async () => {
  const created = await createTask({ title: 'Read book' });
  const res = await request('GET', `/tasks/${created.id}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.title, 'Read book');
});

test('returns 404 for an unknown task', async () => {
  const res = await request('GET', '/tasks/999999');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'task_not_found');
});

test('returns 400 for a non-numeric id', async () => {
  const res = await request('GET', '/tasks/abc');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'invalid_id');
});

test('lists tasks with pagination metadata', async () => {
  for (let i = 1; i <= 5; i++) await createTask({ title: `Task ${i}` });

  const res = await request('GET', '/tasks?page=1&limit=2');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].title, 'Task 1');
  assert.deepEqual(body.meta, { page: 1, limit: 2, total: 5 });
});

test('second page returns the next slice of tasks', async () => {
  for (let i = 1; i <= 5; i++) await createTask({ title: `Task ${i}` });

  const body = await (await request('GET', '/tasks?page=2&limit=2')).json();
  assert.equal(body.data[0].title, 'Task 3');
});

test('filters the list by status', async () => {
  await createTask({ title: 'A', status: 'done' });
  await createTask({ title: 'B', status: 'todo' });

  const body = await (await request('GET', '/tasks?status=done')).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].title, 'A');
  assert.equal(body.meta.total, 1);
});

test('status filter does not allow SQL injection', async () => {
  await createTask({ title: 'A', status: 'done' });
  await createTask({ title: 'B', status: 'todo' });

  const res = await request('GET', `/tasks?status=${encodeURIComponent("x' OR '1'='1")}`);
  const body = await res.json();
  assert.equal(body.data.length, 0);
});

test('caps the page size at 100', async () => {
  const body = await (await request('GET', '/tasks?limit=5000')).json();
  assert.ok(body.meta.limit <= 100);
});

test('updates a single field with PATCH and keeps the rest', async () => {
  const created = await createTask({ title: 'Old', description: 'keep me' });
  const res = await request('PATCH', `/tasks/${created.id}`, { status: 'done' });
  assert.equal(res.status, 200);

  const { data } = await res.json();
  assert.equal(data.status, 'done');
  assert.equal(data.title, 'Old');
  assert.equal(data.description, 'keep me');
});

test('PATCH bumps updated_at', async () => {
  const created = await createTask();
  await new Promise((r) => setTimeout(r, 10));
  const { data } = await (await request('PATCH', `/tasks/${created.id}`, { title: 'New' })).json();
  assert.notEqual(data.updated_at, created.updated_at);
});

test('PATCH rejects an invalid status', async () => {
  const created = await createTask();
  const res = await request('PATCH', `/tasks/${created.id}`, { status: 'archived' });
  assert.equal(res.status, 422);
});

test('PATCH returns 404 for an unknown task', async () => {
  const res = await request('PATCH', '/tasks/999999', { title: 'x' });
  assert.equal(res.status, 404);
});

test('deletes a task with 204', async () => {
  const created = await createTask();
  const res = await request('DELETE', `/tasks/${created.id}`);
  assert.equal(res.status, 204);

  const after = await request('GET', `/tasks/${created.id}`);
  assert.equal(after.status, 404);
});

test('deleting an unknown task returns 404', async () => {
  const res = await request('DELETE', '/tasks/999999');
  assert.equal(res.status, 404);
});

test('unknown routes return 404', async () => {
  const res = await request('GET', '/nope');
  assert.equal(res.status, 404);
});

test('error responses do not leak internal details', async () => {
  const res = await request('POST', '/tasks', '{"title": ');
  const body = await res.json();
  assert.equal(typeof body.error.message, 'string');
  assert.ok(!body.error.message.includes('SyntaxError'));
});
