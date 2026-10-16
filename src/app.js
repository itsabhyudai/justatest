const http = require('node:http');
const { createTaskRepository } = require('./tasks');
const { validateTask, parseId } = require('./validation');

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function send(res, status, payload) {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  send(res, status, { error });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new HttpError(413, 'payload_too_large', 'Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (raw.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'invalid_json', 'Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireId(raw) {
  const id = parseId(raw);
  if (id === null || id < 1) {
    throw new HttpError(400, 'invalid_id', 'Task id must be a positive integer');
  }
  return id;
}

function requireValid(body, options) {
  const { errors } = validateTask(body, options);
  if (errors.length > 0) {
    throw new HttpError(422, 'validation_failed', 'Request validation failed', errors);
  }
}

function createApp({ db }) {
  const tasks = createTaskRepository(db);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'tasks' || parts.length > 2) {
      throw new HttpError(404, 'not_found', `No route for ${req.method} ${url.pathname}`);
    }

    // /tasks
    if (parts.length === 1) {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status') || undefined;
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 10);

        const data = tasks.list({ status, page, limit });
        const total = tasks.count(status);
        return send(res, 200, { data, meta: { page, limit, total } });
      }

      if (req.method === 'POST') {
        const body = await readJson(req);
        requireValid(body);
        const task = tasks.insert({
          title: body.title,
          description: body.description,
          due_date: body.due_date,
          status: body.status,
        });
        return send(res, 200, { data: task });
      }

      throw new HttpError(405, 'method_not_allowed', `${req.method} is not allowed on /tasks`);
    }

    // /tasks/:id
    const id = requireId(parts[1]);

    if (req.method === 'GET') {
      const task = tasks.findById(id);
      if (!task) throw new HttpError(404, 'task_not_found', `Task ${id} does not exist`);
      return send(res, 200, { data: task });
    }

    if (req.method === 'PATCH') {
      const existing = tasks.findById(id);
      if (!existing) throw new HttpError(404, 'task_not_found', `Task ${id} does not exist`);

      const body = await readJson(req);
      requireValid(body, { partial: true });

      const updated = tasks.update(id, {
        title: body.title ?? existing.title,
        description: body.description || null,
        due_date: body.due_date !== undefined ? body.due_date : existing.due_date,
        status: body.status ?? existing.status,
      });
      return send(res, 200, { data: updated });
    }

    if (req.method === 'DELETE') {
      tasks.remove(id);
      return send(res, 204);
    }

    throw new HttpError(405, 'method_not_allowed', `${req.method} is not allowed on /tasks/:id`);
  }

  return http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return sendError(res, err.status, err.code, err.message, err.details);
      }
      console.error(err);
      return sendError(res, 500, 'internal_error', err.message);
    }
  });
}

module.exports = { createApp };
