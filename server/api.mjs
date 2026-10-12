import express from 'express';
import { newId, now, rounded } from './db.mjs';
import { getReleaseMetadata } from './release.mjs';

export class ApiError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, message, code) => {
  throw new ApiError(status, message, code);
};
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const string = (value, label, max = 100) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(400, `${label} must be between 1 and ${max} characters.`);
  return value.trim();
};
const text = (value, label, max = 2000) => {
  if (typeof value !== 'string' || value.length > max)
    fail(400, `${label} must be text up to ${max} characters.`);
  return value.trim();
};
const quantity = (value, label = 'Quantity', zero = false) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    (!zero && value === 0) ||
    value > 1000000 ||
    rounded(value) !== value
  )
    fail(
      400,
      `${label} must be a ${zero ? 'non-negative' : 'positive'} number, up to 1,000,000, with at most 6 decimal places.`,
    );
  return value;
};
const date = (value) => {
  if (value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail(400, 'Use a valid date in YYYY-MM-DD format.');
  return value;
};
const color = (value) => {
  if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value))
    fail(400, 'Color must be a six-digit hex color, such as #568B72.');
  return value;
};
const id = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    fail(400, 'Invalid identifier.');
  return value;
};

export function createApi(s) {
  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.get('/version', (req, res) => res.json(getReleaseMetadata()));
  const existing = (table, value, label = table.slice(0, -1)) => {
    const row = s.get(`SELECT * FROM ${table} WHERE id=?`, id(value));
    if (!row) fail(404, `${label[0].toUpperCase() + label.slice(1)} not found.`, 'NOT_FOUND');
    return row;
  };
  const reference = (table, value, label, nullable = false) => {
    if (nullable && value === null) return null;
    const valid = id(value);
    if (!s.get(`SELECT id FROM ${table} WHERE id=?`, valid)) fail(400, `${label} does not exist.`);
    return valid;
  };
  const productView = (productId) =>
    s.state().inventory.find((product) => product.id === productId);
  const listView = (listId) => s.state().lists.find((list) => list.id === listId);
  const actor = (req) => req.member;
  const body = (req) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      fail(400, 'Send a JSON object.');
    return req.body;
  };
  const route = (method, path, fn) =>
    api[method](path, (req, res, next) => {
      try {
        const value = fn(req);
        res
          .status(
            method === 'post' &&
              !path.includes('consume') &&
              !path.includes('complete') &&
              !path.includes('reset')
              ? 201
              : 200,
          )
          .json(value ?? s.state());
      } catch (error) {
        next(error);
      }
    });
  const editableList = (listId) => {
    const list = existing('lists', listId, 'shopping list');
    if (list.status === 'completed')
      fail(
        409,
        'Completed trips are kept as history and cannot be edited. Create a new trip.',
        'LIST_COMPLETED',
      );
    return list;
  };
  const productInfo = (product) => ({ ...product, unit: product.unit });
  const addBatch = (productId, locationId, amount, expiresAt) => {
    const batchId = newId();
    s.run(
      'INSERT INTO batches VALUES (?,?,?,?,?,?)',
      batchId,
      productId,
      locationId,
      amount,
      expiresAt,
      now(),
    );
    return batchId;
  };
  const addEvent = (product, kind, amount, req, locationId) =>
    s.addActivity(
      productInfo(product),
      kind,
      amount,
      actor(req),
      existing('locations', locationId),
    );
  api.use((req, res, next) => {
    try {
      const memberId = req.get('X-Member-Id');
      req.member = memberId
        ? s.get('SELECT * FROM members WHERE id=?', id(memberId))
        : s.get('SELECT * FROM members ORDER BY rowid LIMIT 1');
      if (!req.member) fail(400, 'The selected household member does not exist.');
      next();
    } catch (error) {
      next(error);
    }
  });

  route('get', '/state', () => s.state());
  route('get', '/health', () => ({ ok: true, database: 'sqlite' }));
  api.get('/export', (req, res) => {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hearth-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.json({ formatVersion: 1, exportedAt: now(), ...s.export() });
  });
  route('patch', '/household', (req) => {
    const b = body(req);
    s.run('UPDATE household SET name=?', string(b.name, 'Household name'));
  });
  route('post', '/household/reset', (req) => {
    body(req);
    s.transaction(() => {
      if (!s.get('SELECT demo FROM household').demo)
        fail(
          409,
          'Sample data has already been cleared. Your household inventory has been preserved.',
          'DEMO_ALREADY_CLEARED',
        );
      s.run('DELETE FROM activity');
      s.run('DELETE FROM items');
      s.run('DELETE FROM lists');
      s.run('DELETE FROM batches');
      s.run('DELETE FROM products');
      s.run('UPDATE household SET demo=0');
    });
  });

  route('post', '/products', (req) => {
    const b = body(req);
    const name = string(b.name, 'Item name');
    const emoji = b.emoji === undefined ? '🛒' : string(b.emoji, 'Emoji', 20);
    const categoryId = reference('categories', b.categoryId, 'Category');
    const unit = string(b.unit ?? 'pcs', 'Unit', 32);
    const min = quantity(b.minQuantity ?? 1, 'Restock threshold', true);
    const providerId = reference(
      'providers',
      b.preferredProviderId ?? null,
      'Preferred shop',
      true,
    );
    const initial = quantity(b.initialQuantity ?? b.quantity ?? 0, 'Initial quantity', true);
    const locationId = initial ? reference('locations', b.locationId, 'Location') : null;
    const expiresAt = date(b.expiresAt ?? null);
    const productId = newId();
    s.transaction(() => {
      s.run(
        'INSERT INTO products VALUES (?,?,?,?,?,?,?)',
        productId,
        name,
        emoji,
        categoryId,
        unit,
        min,
        providerId,
      );
      if (initial) {
        addBatch(productId, locationId, initial, expiresAt);
        addEvent(existing('products', productId), 'added', initial, req, locationId);
      }
    });
    return productView(productId);
  });
  route('patch', '/products/:id', (req) => {
    const product = existing('products', req.params.id);
    const b = body(req);
    const next = {
      name: has(b, 'name') ? string(b.name, 'Item name') : product.name,
      emoji: has(b, 'emoji') ? string(b.emoji, 'Emoji', 20) : product.emoji,
      category: has(b, 'categoryId')
        ? reference('categories', b.categoryId, 'Category')
        : product.category_id,
      unit: has(b, 'unit') ? string(b.unit, 'Unit', 32) : product.unit,
      min: has(b, 'minQuantity')
        ? quantity(b.minQuantity, 'Restock threshold', true)
        : product.min_quantity,
      provider: has(b, 'preferredProviderId')
        ? reference('providers', b.preferredProviderId, 'Preferred shop', true)
        : product.preferred_provider_id,
    };
    if (
      next.unit !== product.unit &&
      (s.get('SELECT id FROM batches WHERE product_id=? AND quantity>0', product.id) ||
        s.get(
          "SELECT items.id FROM items JOIN lists ON lists.id=items.list_id WHERE product_id=? AND lists.status!='completed'",
          product.id,
        ))
    )
      fail(
        409,
        'Consume the current stock and finish active shopping items before changing its unit.',
        'UNIT_IN_USE',
      );
    s.run(
      'UPDATE products SET name=?,emoji=?,category_id=?,unit=?,min_quantity=?,preferred_provider_id=? WHERE id=?',
      next.name,
      next.emoji,
      next.category,
      next.unit,
      next.min,
      next.provider,
      product.id,
    );
  });
  route('delete', '/products/:id', (req) => {
    existing('products', req.params.id);
    s.run('DELETE FROM products WHERE id=?', req.params.id);
  });

  route('post', '/stock', (req) => {
    const b = body(req);
    const product = existing('products', b.productId);
    const locationId = reference('locations', b.locationId, 'Location');
    const amount = quantity(b.quantity);
    const expiresAt = date(b.expiresAt ?? null);
    s.transaction(() => {
      addBatch(product.id, locationId, amount, expiresAt);
      addEvent(product, 'added', amount, req, locationId);
    });
  });
  route('post', '/stock/consume', (req) => {
    const b = body(req);
    const product = existing('products', b.productId);
    const amount = quantity(b.quantity);
    const kind = b.kind ?? b.action ?? 'consumed';
    if (!['consumed', 'discarded'].includes(kind)) fail(400, 'Choose consumed or discarded.');
    const filters = ['product_id=?', 'quantity>0'];
    const values = [product.id];
    if (has(b, 'locationId') && b.locationId !== null && b.locationId !== '') {
      filters.push('location_id=?');
      values.push(reference('locations', b.locationId, 'Location'));
    }
    if (has(b, 'batchId') && b.batchId !== null && b.batchId !== '') {
      const batch = existing('batches', b.batchId, 'stock batch');
      if (batch.product_id !== product.id) fail(400, 'That stock batch belongs to another item.');
      filters.push('id=?');
      values.push(batch.id);
    }
    s.transaction(() => {
      const batches = s.all(
        `SELECT * FROM batches WHERE ${filters.join(' AND ')} ORDER BY expires_at IS NULL,expires_at,added_at,rowid`,
        ...values,
      );
      const available = rounded(batches.reduce((sum, batch) => sum + batch.quantity, 0));
      if (amount > available)
        fail(
          400,
          `Only ${available} ${product.unit} available. Stock cannot become negative.`,
          'INSUFFICIENT_STOCK',
        );
      let remaining = amount;
      for (const batch of batches) {
        if (!remaining) break;
        const used = Math.min(batch.quantity, remaining);
        const left = rounded(batch.quantity - used);
        if (!left) s.run('DELETE FROM batches WHERE id=?', batch.id);
        else s.run('UPDATE batches SET quantity=? WHERE id=?', left, batch.id);
        addEvent(product, kind, used, req, batch.location_id);
        remaining = rounded(remaining - used);
      }
    });
  });
  route('patch', '/batches/:id', (req) => {
    const batch = existing('batches', req.params.id, 'stock batch');
    const b = body(req);
    const amount = has(b, 'quantity') ? quantity(b.quantity, 'Quantity', true) : batch.quantity;
    const locationId = has(b, 'locationId')
      ? reference('locations', b.locationId, 'Location')
      : batch.location_id;
    const expiresAt = has(b, 'expiresAt') ? date(b.expiresAt) : batch.expires_at;
    s.transaction(() => {
      if (!amount) s.run('DELETE FROM batches WHERE id=?', batch.id);
      else
        s.run(
          'UPDATE batches SET quantity=?,location_id=?,expires_at=? WHERE id=?',
          amount,
          locationId,
          expiresAt,
          batch.id,
        );
      if (
        amount !== batch.quantity ||
        locationId !== batch.location_id ||
        expiresAt !== batch.expires_at
      )
        addEvent(
          existing('products', batch.product_id),
          'adjusted',
          rounded(Math.abs(amount - batch.quantity)) || amount,
          req,
          locationId,
        );
    });
  });

  route('post', '/lists', (req) => {
    const b = body(req);
    const listId = newId();
    s.run(
      'INSERT INTO lists VALUES (?,?,?,?,?,?,?)',
      listId,
      string(b.name, 'List name'),
      date(b.date ?? null),
      reference('members', b.memberId ?? null, 'Member', true),
      'planned',
      text(b.notes ?? '', 'Notes'),
      now(),
    );
    return listView(listId);
  });
  route('patch', '/lists/:id', (req) => {
    const list = editableList(req.params.id);
    const b = body(req);
    const status = has(b, 'status') ? b.status : list.status;
    if (!['planned', 'shopping'].includes(status))
      fail(400, 'Use the complete-trip action to finish a shopping list.');
    s.run(
      'UPDATE lists SET name=?,date=?,member_id=?,status=?,notes=? WHERE id=?',
      has(b, 'name') ? string(b.name, 'List name') : list.name,
      has(b, 'date') ? date(b.date) : list.date,
      has(b, 'memberId') ? reference('members', b.memberId, 'Member', true) : list.member_id,
      status,
      has(b, 'notes') ? text(b.notes, 'Notes') : list.notes,
      list.id,
    );
  });
  route('delete', '/lists/:id', (req) => {
    existing('lists', req.params.id, 'shopping list');
    s.run('DELETE FROM lists WHERE id=?', req.params.id);
  });
  route('post', '/lists/:id/items', (req) => {
    const list = editableList(req.params.id);
    const b = body(req);
    const productId = reference('products', b.productId ?? null, 'Item', true);
    const product = productId ? existing('products', productId) : null;
    const name = product?.name ?? string(b.name, 'Item name');
    const emoji = product?.emoji ?? string(b.emoji ?? '🛒', 'Emoji', 20);
    const unit = product?.unit ?? string(b.unit ?? 'pcs', 'Unit', 32);
    const amount = quantity(b.quantity ?? 1);
    const providerId = reference(
      'providers',
      has(b, 'providerId') ? b.providerId : (product?.preferred_provider_id ?? null),
      'Shop',
      true,
    );
    s.transaction(() => {
      const match = productId
        ? s.get(
            'SELECT * FROM items WHERE list_id=? AND product_id=? AND provider_id IS ? AND checked=0',
            list.id,
            productId,
            providerId,
          )
        : s.get(
            'SELECT * FROM items WHERE list_id=? AND product_id IS NULL AND name=? COLLATE NOCASE AND unit=? AND provider_id IS ? AND checked=0',
            list.id,
            name,
            unit,
            providerId,
          );
      if (match)
        s.run(
          'UPDATE items SET quantity=? WHERE id=?',
          quantity(rounded(match.quantity + amount)),
          match.id,
        );
      else
        s.run(
          'INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?)',
          newId(),
          list.id,
          productId,
          name,
          emoji,
          amount,
          unit,
          providerId,
          0,
          0,
        );
    });
  });
  route('patch', '/items/:id', (req) => {
    const item = existing('items', req.params.id, 'shopping item');
    editableList(item.list_id);
    const b = body(req);
    if (has(b, 'checked') && typeof b.checked !== 'boolean')
      fail(400, 'Checked must be true or false.');
    s.run(
      'UPDATE items SET checked=?,quantity=?,provider_id=? WHERE id=?',
      has(b, 'checked') ? Number(b.checked) : item.checked,
      has(b, 'quantity') ? quantity(b.quantity) : item.quantity,
      has(b, 'providerId') ? reference('providers', b.providerId, 'Shop', true) : item.provider_id,
      item.id,
    );
  });
  route('delete', '/items/:id', (req) => {
    const item = existing('items', req.params.id, 'shopping item');
    editableList(item.list_id);
    s.run('DELETE FROM items WHERE id=?', item.id);
  });
  route('post', '/lists/:id/complete', (req) => {
    const b = body(req);
    const locationId = reference('locations', b.locationId, 'Check-in location');
    const expiresAt = date(b.expiresAt ?? null);
    s.transaction(() => {
      const list = editableList(req.params.id);
      const items = s.all(
        'SELECT * FROM items WHERE list_id=? AND checked=1 AND transferred=0',
        list.id,
      );
      if (!items.length)
        fail(400, 'Check at least one purchased item before completing this trip.');
      for (const item of items) {
        let product = item.product_id
          ? existing('products', item.product_id)
          : s.get('SELECT * FROM products WHERE name=? COLLATE NOCASE', item.name);
        if (product && product.unit !== item.unit)
          fail(
            409,
            `${item.name} already uses ${product.unit}. Change or remove this shopping item before checking in.`,
            'UNIT_CONFLICT',
          );
        if (!product) {
          const category =
            s.get("SELECT id FROM categories WHERE id='pantry'") ??
            s.get('SELECT id FROM categories ORDER BY rowid LIMIT 1');
          if (!category)
            fail(409, 'Create an item category before checking in a custom shopping item.');
          const productId = newId();
          s.run(
            'INSERT INTO products VALUES (?,?,?,?,?,?,?)',
            productId,
            item.name,
            item.emoji,
            category.id,
            item.unit,
            1,
            item.provider_id,
          );
          product = existing('products', productId);
        }
        addBatch(product.id, locationId, item.quantity, expiresAt);
        addEvent(product, 'purchased', item.quantity, req, locationId);
        s.run('UPDATE items SET product_id=?,transferred=1 WHERE id=?', product.id, item.id);
      }
      s.run("UPDATE lists SET status='completed' WHERE id=?", list.id);
    });
  });

  const registries = {
    categories: {
      fields: ['name', 'emoji', 'color'],
      defaults: { emoji: '🏷️', color: '#628B61' },
      refs: [['products', 'category_id']],
    },
    locations: {
      fields: ['name', 'emoji'],
      defaults: { emoji: '📦' },
      refs: [['batches', 'location_id']],
    },
    providers: {
      fields: ['name', 'color', 'notes'],
      defaults: { color: '#648C69', notes: '' },
      refs: [
        ['products', 'preferred_provider_id'],
        ['items', 'provider_id'],
      ],
    },
    members: {
      fields: ['name', 'color'],
      defaults: { color: '#568B72' },
      refs: [['lists', 'member_id']],
    },
  };
  const fieldValue = (field, value) =>
    field === 'name'
      ? string(value, 'Name')
      : field === 'emoji'
        ? string(value, 'Emoji', 20)
        : field === 'color'
          ? color(value)
          : text(value, 'Notes');
  for (const [table, config] of Object.entries(registries)) {
    route('post', `/${table}`, (req) => {
      const b = body(req);
      const values = config.fields.map((field) =>
        fieldValue(field, has(b, field) ? b[field] : config.defaults[field]),
      );
      const recordId = newId();
      s.run(
        `INSERT INTO ${table} (id,${config.fields.join(',')}) VALUES (${['id', ...config.fields].map(() => '?').join(',')})`,
        recordId,
        ...values,
      );
      return existing(table, recordId);
    });
    route('patch', `/${table}/:id`, (req) => {
      const record = existing(table, req.params.id);
      const b = body(req);
      const values = config.fields.map((field) =>
        has(b, field) ? fieldValue(field, b[field]) : record[field],
      );
      s.run(
        `UPDATE ${table} SET ${config.fields.map((field) => `${field}=?`).join(',')} WHERE id=?`,
        ...values,
        record.id,
      );
    });
    route('delete', `/${table}/:id`, (req) => {
      const record = existing(table, req.params.id);
      if (table === 'members' && s.get('SELECT count(*) AS n FROM members').n <= 1)
        fail(409, 'Keep at least one household member.', 'LAST_MEMBER');
      if (table === 'categories' && s.get('SELECT count(*) AS n FROM categories').n <= 1)
        fail(409, 'Keep at least one item category.', 'LAST_CATEGORY');
      if (table === 'locations' && s.get('SELECT count(*) AS n FROM locations').n <= 1)
        fail(409, 'Keep at least one storage location.', 'LAST_LOCATION');
      for (const [target, column] of config.refs)
        if (s.get(`SELECT id FROM ${target} WHERE ${column}=? LIMIT 1`, record.id))
          fail(
            409,
            `This ${table.slice(0, -1)} is in use. Reassign its items or lists before removing it.`,
            'IN_USE',
          );
      s.run(`DELETE FROM ${table} WHERE id=?`, record.id);
    });
  }
  api.use((req, res) =>
    res.status(404).json({ error: 'API endpoint not found.', code: 'NOT_FOUND' }),
  );
  api.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message, code: error.code });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Send valid JSON.', code: 'INVALID_JSON' });
    if (error.type === 'entity.too.large')
      return res
        .status(413)
        .json({ error: 'The request is too large.', code: 'REQUEST_TOO_LARGE' });
    if (
      error.code?.startsWith('SQLITE_CONSTRAINT') ||
      error.errcode === 19 ||
      (typeof error.errcode === 'number' && (error.errcode & 255) === 19)
    ) {
      const duplicate = error.message?.includes('UNIQUE');
      return res.status(409).json({
        error: duplicate
          ? 'That name is already in use. Choose a different name.'
          : 'This change conflicts with an existing item or reference.',
        code: duplicate ? 'DUPLICATE_NAME' : 'CONFLICT',
      });
    }
    console.error('Hearth API error:', error);
    res
      .status(500)
      .json({ error: 'The change could not be saved. Please try again.', code: 'SERVER_ERROR' });
  });
  return api;
}
