const STATUSES = ['todo', 'in_progress', 'done'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateTask(body, { partial = false } = {}) {
  const errors = [];

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  if (!partial || 'title' in body) {
    if (typeof body.title !== 'string' || body.title.length === 0) {
      errors.push({ field: 'title', message: 'Title is required and must be a non-empty string' });
    } else if (body.title.length > 200) {
      errors.push({ field: 'title', message: 'Title must be 200 characters or fewer' });
    }
  }

  if ('description' in body && body.description !== null) {
    if (typeof body.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (body.description.length > 2000) {
      errors.push({ field: 'description', message: 'Description must be 2000 characters or fewer' });
    }
  }

  if ('due_date' in body && body.due_date !== null) {
    if (typeof body.due_date !== 'string' || !DATE_PATTERN.test(body.due_date)) {
      errors.push({ field: 'due_date', message: 'due_date must be a date in YYYY-MM-DD format' });
    }
  }

  if (!partial && body.status !== undefined && !STATUSES.includes(body.status)) {
    errors.push({ field: 'status', message: `status must be one of: ${STATUSES.join(', ')}` });
  }

  return { errors };
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

module.exports = { validateTask, parseId, STATUSES };
