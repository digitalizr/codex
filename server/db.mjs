import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();
export const rounded = (value) => Math.round(value * 1e6) / 1e6;

export function createStore(
  path = process.env.GROCERY_DB_PATH || resolve('data/household.sqlite'),
) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const store = {
    db,
    run: (sql, ...args) => db.prepare(sql).run(...args),
    get: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) throw new Error('This database was created by a newer version of Hearth.');
  if (!version)
    store.transaction(() => {
      db.exec(`
      CREATE TABLE household (id TEXT PRIMARY KEY, name TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 1 CHECK (demo IN (0,1)));
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, emoji TEXT NOT NULL, color TEXT NOT NULL);
      CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, emoji TEXT NOT NULL);
      CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
      CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL);
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, emoji TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        unit TEXT NOT NULL, min_quantity REAL NOT NULL DEFAULT 0 CHECK(min_quantity >= 0),
        preferred_provider_id TEXT REFERENCES providers(id) ON DELETE RESTRICT
      );
      CREATE TABLE batches (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
        quantity REAL NOT NULL CHECK(quantity >= 0), expires_at TEXT, added_at TEXT NOT NULL
      );
      CREATE INDEX batches_product ON batches(product_id);
      CREATE TABLE lists (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, date TEXT,
        member_id TEXT REFERENCES members(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','shopping','completed')),
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE items (
        id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        name TEXT NOT NULL, emoji TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity > 0), unit TEXT NOT NULL,
        provider_id TEXT REFERENCES providers(id) ON DELETE RESTRICT,
        checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN (0,1)),
        transferred INTEGER NOT NULL DEFAULT 0 CHECK(transferred IN (0,1))
      );
      CREATE INDEX items_list ON items(list_id);
      CREATE TABLE activity (
        id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL, emoji TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('added','consumed','discarded','adjusted','purchased')),
        quantity REAL NOT NULL CHECK(quantity >= 0), unit TEXT NOT NULL,
        member_name TEXT NOT NULL, location_name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
      seed(store);
    });
  store.state = () => readState(store);
  store.export = () => readState(store, true);
  store.addActivity = (product, action, quantity, member, location) =>
    store.run(
      'INSERT INTO activity VALUES (?,?,?,?,?,?,?,?,?,?)',
      newId(),
      product.id,
      product.name,
      product.emoji,
      action,
      rounded(quantity),
      product.unit,
      member.name,
      location.name,
      now(),
    );
  return store;
}

function dateAfter(days) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function seed(s) {
  s.run('INSERT INTO household VALUES (?,?,?)', 'home', 'Our household', 1);
  s.run('INSERT INTO members VALUES (?,?,?)', 'member-you', 'You', '#568B72');
  const categories = [
    ['produce', 'Produce', '🥬', '#628B61'],
    ['dairy', 'Dairy & eggs', '🥛', '#D4A457'],
    ['grains', 'Grains & bread', '🍞', '#BA8C5E'],
    ['protein', 'Meat & protein', '🐟', '#BB786B'],
    ['pantry', 'Pantry staples', '🫙', '#8B83AB'],
  ];
  for (const row of categories) s.run('INSERT INTO categories VALUES (?,?,?,?)', ...row);
  for (const row of [
    ['fridge', 'Fridge', '❄️'],
    ['pantry', 'Pantry', '🫙'],
    ['freezer', 'Freezer', '🧊'],
  ])
    s.run('INSERT INTO locations VALUES (?,?,?)', ...row);
  for (const row of [
    ['rewe', 'REWE', '#C86B59', 'Your everyday shop'],
    ['penny', 'PENNY', '#D2AC56', 'Good-value essentials'],
    ['market', 'Weekly market', '#648C69', 'Fresh, local and seasonal'],
  ])
    s.run('INSERT INTO providers VALUES (?,?,?,?)', ...row);
  const products = [
    ['avocado', 'Avocados', '🥑', 'produce', 'pcs', 2, 'market', 3, 'pantry', 4],
    ['spinach', 'Baby spinach', '🥬', 'produce', 'bags', 1, 'rewe', 1, 'fridge', 2],
    ['tomato', 'Cherry tomatoes', '🍅', 'produce', 'packs', 1, 'market', 2, 'fridge', 5],
    ['banana', 'Bananas', '🍌', 'produce', 'pcs', 3, 'penny', 2, 'pantry', 4],
    ['milk', 'Oat milk', '🥛', 'dairy', 'cartons', 2, 'rewe', 1, 'fridge', 7],
    ['eggs', 'Free-range eggs', '🥚', 'dairy', 'pcs', 6, 'market', 8, 'fridge', 12],
    ['yogurt', 'Greek yogurt', '🥣', 'dairy', 'tubs', 1, 'rewe', 2, 'fridge', 3],
    ['butter', 'Butter', '🧈', 'dairy', 'packs', 1, 'penny', 0, 'fridge', null],
    ['bread', 'Sourdough bread', '🍞', 'grains', 'loaves', 1, 'market', 1, 'pantry', 2],
    ['rice', 'Basmati rice', '🍚', 'grains', 'kg', 0.5, 'penny', 1.5, 'pantry', null],
    ['pasta', 'Penne pasta', '🍝', 'grains', 'packs', 2, 'penny', 1, 'pantry', null],
    ['salmon', 'Salmon fillets', '🐟', 'protein', 'pcs', 2, 'rewe', 2, 'freezer', 45],
    ['chickpea', 'Chickpeas', '🫘', 'protein', 'cans', 2, 'penny', 4, 'pantry', null],
    ['oliveoil', 'Olive oil', '🫒', 'pantry', 'bottles', 1, 'rewe', 0.5, 'pantry', null],
    ['coffee', 'Coffee beans', '☕', 'pantry', 'bags', 1, 'rewe', 2, 'pantry', null],
    ['peanutbutter', 'Peanut butter', '🥜', 'pantry', 'jars', 1, 'penny', 0, 'pantry', null],
  ];
  for (const [
    id,
    name,
    emoji,
    category,
    unit,
    min,
    provider,
    quantity,
    location,
    expiry,
  ] of products) {
    s.run(
      'INSERT INTO products VALUES (?,?,?,?,?,?,?)',
      id,
      name,
      emoji,
      category,
      unit,
      min,
      provider,
    );
    if (quantity)
      s.run(
        'INSERT INTO batches VALUES (?,?,?,?,?,?)',
        newId(),
        id,
        location,
        quantity,
        expiry === null ? null : dateAfter(expiry),
        now(),
      );
  }
  s.run(
    'INSERT INTO lists VALUES (?,?,?,?,?,?,?)',
    'weekly-restock',
    'The weekly restock',
    dateAfter(1),
    'member-you',
    'planned',
    'A few essentials for the week ahead.',
    now(),
  );
  for (const row of [
    ['milk', 'Oat milk', '🥛', 2, 'cartons', 'rewe'],
    ['butter', 'Butter', '🧈', 1, 'packs', 'penny'],
    ['banana', 'Bananas', '🍌', 4, 'pcs', 'market'],
  ]) {
    s.run(
      'INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?)',
      newId(),
      'weekly-restock',
      ...row.slice(0, 3),
      row[3],
      row[4],
      row[5],
      0,
      0,
    );
  }
  const entries = [
    ['spinach', 'Baby spinach', '🥬', 'added', 1, 'bags', 'Fridge', 2],
    ['eggs', 'Free-range eggs', '🥚', 'consumed', 2, 'pcs', 'Fridge', 1],
    ['banana', 'Bananas', '🍌', 'consumed', 1, 'pcs', 'Pantry', 0],
  ];
  for (const [id, name, emoji, action, quantity, unit, location, days] of entries) {
    s.run(
      'INSERT INTO activity VALUES (?,?,?,?,?,?,?,?,?,?)',
      newId(),
      id,
      name,
      emoji,
      action,
      quantity,
      unit,
      'You',
      location,
      new Date(Date.now() - days * 86400000 - 3600000).toISOString(),
    );
  }
}

function readState(s, allActivity = false) {
  const household = s.get('SELECT * FROM household');
  household.demo = !!household.demo;
  const members = s.all('SELECT * FROM members ORDER BY rowid');
  const categories = s.all('SELECT * FROM categories ORDER BY rowid');
  const locations = s.all('SELECT * FROM locations ORDER BY rowid');
  const providers = s.all('SELECT * FROM providers ORDER BY rowid');
  const products = s.all(
    'SELECT id,name,emoji,category_id AS categoryId,unit,min_quantity AS minQuantity,preferred_provider_id AS preferredProviderId FROM products ORDER BY name COLLATE NOCASE',
  );
  const batches = s.all(
    'SELECT id,product_id AS productId,location_id AS locationId,quantity,expires_at AS expiresAt,added_at AS addedAt FROM batches WHERE quantity > 0 ORDER BY expires_at IS NULL,expires_at,added_at',
  );
  const inventory = products.map((product) => {
    const stock = batches.filter((batch) => batch.productId === product.id);
    const quantity = rounded(stock.reduce((sum, batch) => sum + batch.quantity, 0));
    return {
      ...product,
      quantity,
      batches: stock,
      status: quantity === 0 ? 'out' : quantity <= product.minQuantity ? 'low' : 'good',
      expiresAt: stock.find((batch) => batch.expiresAt)?.expiresAt || null,
    };
  });
  const items = s
    .all(
      'SELECT id,list_id AS listId,product_id AS productId,name,emoji,quantity,unit,provider_id AS providerId,checked FROM items ORDER BY rowid',
    )
    .map((item) => ({ ...item, checked: !!item.checked }));
  const lists = s
    .all(
      'SELECT id,name,date,member_id AS memberId,status,notes,created_at AS createdAt FROM lists ORDER BY created_at DESC,rowid DESC',
    )
    .map((list) => ({ ...list, items: items.filter((item) => item.listId === list.id) }));
  const activity = s.all(
    `SELECT id,product_id AS productId,product_name AS productName,emoji,action,quantity,unit,member_name AS memberName,location_name AS locationName,created_at AS createdAt FROM activity ORDER BY created_at DESC,rowid DESC ${allActivity ? '' : 'LIMIT 300'}`,
  );
  const suggestions = inventory.flatMap((product) => {
    if (product.status === 'good') return [];
    const onLists = lists
      .filter((list) => list.status !== 'completed')
      .reduce(
        (sum, list) =>
          sum +
          list.items
            .filter((item) => item.productId === product.id)
            .reduce((subtotal, item) => subtotal + item.quantity, 0),
        0,
      );
    const needed = rounded(Math.max(product.minQuantity - product.quantity, 1) - onLists);
    if (needed <= 0) return [];
    return [
      {
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        categoryId: product.categoryId,
        quantity: needed,
        unit: product.unit,
        reason: product.status,
        currentQuantity: product.quantity,
        minQuantity: product.minQuantity,
        preferredProviderId: product.preferredProviderId,
      },
    ];
  });
  return {
    household,
    members,
    categories,
    locations,
    providers,
    inventory,
    lists,
    activity,
    suggestions,
  };
}
