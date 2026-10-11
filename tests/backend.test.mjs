import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createStore } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hearth-test-'));
  const dbPath = join(directory, 'test.sqlite');
  const store = createStore(dbPath);
  const app = express();
  app.use('/api', createApi(store));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  }
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, { method = 'GET', body, status, memberId } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(memberId ? { 'X-Member-Id': memberId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (status !== undefined) assert.equal(response.status, status, JSON.stringify(data));
    else assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  const state = () => request('/state');
  const post = (path, body, options = {}) => request(path, { ...options, method: 'POST', body });
  const patch = (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body });
  await post('/household/reset', {});
  const product = (name = 'Test rice', extras = {}) =>
    post('/products', {
      name,
      emoji: '🍚',
      categoryId: 'grains',
      unit: 'kg',
      minQuantity: 1,
      preferredProviderId: 'penny',
      ...extras,
    });
  const item = (snapshot, productId) => snapshot.inventory.find((value) => value.id === productId);
  return { request, state, post, patch, product, item, stop, dbPath, store };
}

test('fractional stock is consumed by earliest expiry, with undated stock last', async (t) => {
  const f = await fixture(t);
  const product = await f.product();
  for (const [quantity, expiresAt] of [
    [1.25, '2030-03-01'],
    [0.75, '2030-01-01'],
    [1, null],
  ]) {
    await f.post('/stock', { productId: product.id, locationId: 'pantry', quantity, expiresAt });
  }
  await f.post('/stock/consume', { productId: product.id, quantity: 1, kind: 'consumed' });
  let snapshot = await f.state();
  let stock = f.item(snapshot, product.id);
  assert.equal(stock.quantity, 2);
  assert.deepEqual(
    stock.batches.map((batch) => [batch.quantity, batch.expiresAt]),
    [
      [1, '2030-03-01'],
      [1, null],
    ],
  );
  assert.equal(
    snapshot.activity
      .filter((event) => event.action === 'consumed')
      .reduce((sum, event) => sum + event.quantity, 0),
    1,
  );
  await f.post('/stock/consume', { productId: product.id, quantity: 1.125, kind: 'discarded' });
  snapshot = await f.state();
  stock = f.item(snapshot, product.id);
  assert.equal(stock.quantity, 0.875);
  assert.deepEqual(
    stock.batches.map((batch) => [batch.quantity, batch.expiresAt]),
    [[0.875, null]],
  );
  assert.equal(
    snapshot.activity
      .filter((event) => event.action === 'discarded')
      .reduce((sum, event) => sum + event.quantity, 0),
    1.125,
  );
});

test('underflow rejects the entire mutation, including its activity records', async (t) => {
  const f = await fixture(t);
  const product = await f.product();
  await f.post('/stock', { productId: product.id, locationId: 'pantry', quantity: 0.5 });
  await f.post('/stock', { productId: product.id, locationId: 'fridge', quantity: 0.25 });
  const before = await f.state();
  const error = await f.post(
    '/stock/consume',
    { productId: product.id, quantity: 1, kind: 'consumed' },
    { status: 400 },
  );
  assert.equal(error.code, 'INSUFFICIENT_STOCK');
  const after = await f.state();
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(after.activity, before.activity);
});

test('location and explicit batch selection respect the actual stock being used', async (t) => {
  const f = await fixture(t);
  const product = await f.product();
  const other = await f.product('Other rice');
  await f.post('/stock', {
    productId: product.id,
    locationId: 'fridge',
    quantity: 0.5,
    expiresAt: '2030-01-01',
  });
  await f.post('/stock', {
    productId: product.id,
    locationId: 'pantry',
    quantity: 0.75,
    expiresAt: '2030-03-01',
  });
  await f.post('/stock/consume', { productId: product.id, quantity: 0.25, locationId: 'pantry' });
  let snapshot = await f.state();
  const batches = f.item(snapshot, product.id).batches;
  assert.deepEqual(
    batches.map((batch) => [batch.locationId, batch.quantity]),
    [
      ['fridge', 0.5],
      ['pantry', 0.5],
    ],
  );
  await f.post(
    '/stock/consume',
    { productId: other.id, quantity: 0.25, batchId: batches[0].id },
    { status: 400 },
  );
  assert.deepEqual((await f.state()).inventory, snapshot.inventory);
  await f.post('/stock/consume', { productId: product.id, quantity: 0.25, batchId: batches[1].id });
  snapshot = await f.state();
  assert.deepEqual(
    f.item(snapshot, product.id).batches.map((batch) => [batch.locationId, batch.quantity]),
    [
      ['fridge', 0.5],
      ['pantry', 0.25],
    ],
  );
});

test('completion checks in only purchased items once and preserves unchecked entries', async (t) => {
  const f = await fixture(t);
  const bought = await f.product('Oat milk', { unit: 'litres', categoryId: 'dairy' });
  const skipped = await f.product('Beans', { unit: 'cans', categoryId: 'protein' });
  const list = await f.post('/lists', {
    name: 'Two-store trip',
    date: '2030-01-02',
    memberId: 'member-you',
  });
  await f.post(`/lists/${list.id}/items`, {
    productId: bought.id,
    quantity: 1.5,
    providerId: 'rewe',
  });
  await f.post(`/lists/${list.id}/items`, {
    productId: skipped.id,
    quantity: 2,
    providerId: 'penny',
  });
  let snapshot = await f.state();
  let trip = snapshot.lists.find((value) => value.id === list.id);
  assert.ok(trip.items.every((value) => value.checked === false));
  await f.patch(`/items/${trip.items.find((value) => value.productId === bought.id).id}`, {
    checked: true,
  });
  await f.post(`/lists/${list.id}/complete`, { locationId: 'fridge', expiresAt: '2030-01-10' });
  snapshot = await f.state();
  trip = snapshot.lists.find((value) => value.id === list.id);
  assert.equal(trip.status, 'completed');
  assert.equal(trip.items.length, 2);
  assert.equal(trip.items.find((value) => value.productId === skipped.id).checked, false);
  assert.equal(f.item(snapshot, bought.id).quantity, 1.5);
  assert.equal(f.item(snapshot, skipped.id).quantity, 0);
  assert.deepEqual(
    f.item(snapshot, bought.id).batches.map((batch) => [batch.locationId, batch.expiresAt]),
    [['fridge', '2030-01-10']],
  );
  assert.deepEqual(trip.items.map((value) => value.providerId).sort(), ['penny', 'rewe']);
  assert.equal(snapshot.activity.filter((value) => value.action === 'purchased').length, 1);
  const error = await f.post(
    `/lists/${list.id}/complete`,
    { locationId: 'fridge' },
    { status: 409 },
  );
  assert.equal(error.code, 'LIST_COMPLETED');
  const afterRetry = await f.state();
  assert.deepEqual(afterRetry.inventory, snapshot.inventory);
  assert.deepEqual(afterRetry.activity, snapshot.activity);
});

test('replenishment subtracts quantities on all active lists, including checked items', async (t) => {
  const f = await fixture(t);
  const product = await f.product('Restock rice', { minQuantity: 4 });
  await f.post('/stock', { productId: product.id, locationId: 'pantry', quantity: 1 });
  const suggestion = async () =>
    (await f.state()).suggestions.find((value) => value.productId === product.id);
  assert.equal((await suggestion()).quantity, 3);
  const first = await f.post('/lists', { name: 'First stop' });
  await f.post(`/lists/${first.id}/items`, { productId: product.id, quantity: 1.25 });
  assert.equal((await suggestion()).quantity, 1.75);
  let snapshot = await f.state();
  const shoppingItem = snapshot.lists.find((value) => value.id === first.id).items[0];
  await f.patch(`/items/${shoppingItem.id}`, { checked: true });
  assert.equal((await suggestion()).quantity, 1.75);
  const second = await f.post('/lists', { name: 'Second stop' });
  await f.post(`/lists/${second.id}/items`, { productId: product.id, quantity: 1.75 });
  await f.patch(`/lists/${second.id}`, { status: 'shopping' });
  assert.equal(await suggestion(), undefined);
  await f.post(`/lists/${first.id}/complete`, { locationId: 'pantry' });
  snapshot = await f.state();
  assert.equal(f.item(snapshot, product.id).quantity, 2.25);
  assert.equal(await suggestion(), undefined);
  await f.request(`/lists/${second.id}`, { method: 'DELETE' });
  assert.equal((await suggestion()).quantity, 1.75);
});

test('category, location and date validation prevent invalid references and partial writes', async (t) => {
  const f = await fixture(t);
  const before = await f.state();
  await f.product('Invalid category', { categoryId: 'missing-category' }).then(
    () => assert.fail('Invalid category unexpectedly accepted'),
    (error) => assert.match(error.message, /400/),
  );
  assert.deepEqual((await f.state()).inventory, before.inventory);
  const category = await f.post('/categories', { name: 'Baking', emoji: '🥐', color: '#987654' });
  const location = await f.post('/locations', { name: 'Cellar', emoji: '📦' });
  const product = await f.product('Flour', { categoryId: category.id });
  await f.post(
    '/stock',
    { productId: product.id, locationId: 'missing-location', quantity: 1 },
    { status: 400 },
  );
  await f.post(
    '/stock',
    { productId: product.id, locationId: location.id, quantity: 1, expiresAt: '2030-02-30' },
    { status: 400 },
  );
  assert.equal(f.item(await f.state(), product.id).quantity, 0);
  await f.post('/stock', {
    productId: product.id,
    locationId: location.id,
    quantity: 0.75,
    expiresAt: '2030-02-28',
  });
  await f.request(`/categories/${category.id}`, { method: 'DELETE', status: 409 });
  await f.request(`/locations/${location.id}`, { method: 'DELETE', status: 409 });
  const snapshot = await f.state();
  assert.ok(snapshot.categories.some((value) => value.id === category.id));
  assert.ok(snapshot.locations.some((value) => value.id === location.id));
  assert.equal(f.item(snapshot, product.id).quantity, 0.75);
});

test('members can claim scheduled lists and their selected profile records stock actions', async (t) => {
  const f = await fixture(t);
  const partner = await f.post('/members', { name: 'Partner', color: '#AA7788' });
  const list = await f.post('/lists', { name: 'Saturday shops', date: '2030-06-08' });
  assert.equal(list.memberId, null);
  await f.patch(`/lists/${list.id}`, { memberId: partner.id }, { memberId: partner.id });
  await f.patch(`/lists/${list.id}`, { memberId: 'missing-member' }, { status: 400 });
  const product = await f.product();
  await f.post(
    '/stock',
    { productId: product.id, locationId: 'pantry', quantity: 0.5 },
    { memberId: partner.id },
  );
  await f.post(
    '/stock/consume',
    { productId: product.id, quantity: 0.25 },
    { memberId: partner.id },
  );
  const snapshot = await f.state();
  const trip = snapshot.lists.find((value) => value.id === list.id);
  assert.equal(trip.memberId, partner.id);
  assert.equal(trip.date, '2030-06-08');
  assert.ok(snapshot.activity.every((value) => value.memberName === 'Partner'));
  await f.post(
    '/stock',
    { productId: product.id, locationId: 'pantry', quantity: 1 },
    { memberId: 'missing-member', status: 400 },
  );
  assert.deepEqual((await f.state()).inventory, snapshot.inventory);
  await f.request(`/members/${partner.id}`, { method: 'DELETE', status: 409 });
});

test('a checked custom shopping item becomes an inventory product on completion', async (t) => {
  const f = await fixture(t);
  const list = await f.post('/lists', { name: 'Bakery run' });
  await f.post(`/lists/${list.id}/items`, {
    name: 'Rye bread',
    emoji: '🍞',
    quantity: 0.5,
    unit: 'loaves',
    providerId: 'market',
  });
  let snapshot = await f.state();
  const entry = snapshot.lists.find((value) => value.id === list.id).items[0];
  assert.equal(entry.productId, null);
  await f.patch(`/items/${entry.id}`, { checked: true });
  await f.post(`/lists/${list.id}/complete`, { locationId: 'pantry' });
  snapshot = await f.state();
  const product = snapshot.inventory.find((value) => value.name === 'Rye bread');
  assert.ok(product);
  assert.equal(product.quantity, 0.5);
  assert.equal(product.unit, 'loaves');
  assert.equal(product.preferredProviderId, 'market');
  assert.equal(snapshot.lists.find((value) => value.id === list.id).items[0].productId, product.id);
});

test('a later item conflict rolls back the entire shopping check-in', async (t) => {
  const f = await fixture(t);
  const first = await f.product('First purchase');
  await f.product('Rice already registered', { unit: 'kg' });
  const list = await f.post('/lists', { name: 'Conflicting units' });
  await f.post(`/lists/${list.id}/items`, { productId: first.id, quantity: 0.5 });
  await f.post(`/lists/${list.id}/items`, {
    name: 'Rice already registered',
    unit: 'packs',
    quantity: 1,
  });
  let snapshot = await f.state();
  for (const entry of snapshot.lists.find((value) => value.id === list.id).items) {
    await f.patch(`/items/${entry.id}`, { checked: true });
  }
  const before = await f.state();
  const error = await f.post(
    `/lists/${list.id}/complete`,
    { locationId: 'pantry' },
    { status: 409 },
  );
  assert.equal(error.code, 'UNIT_CONFLICT');
  snapshot = await f.state();
  assert.deepEqual(snapshot.inventory, before.inventory);
  assert.deepEqual(snapshot.activity, before.activity);
  assert.deepEqual(snapshot.lists, before.lists);
  assert.equal(snapshot.lists.find((value) => value.id === list.id).status, 'planned');
});

test('clearing starter data cannot be reused to erase a real household', async (t) => {
  const f = await fixture(t);
  const product = await f.product('Real household rice');
  await f.post('/stock', { productId: product.id, locationId: 'pantry', quantity: 1.25 });
  await f.post('/lists', { name: 'A real shopping trip' });
  const before = await f.state();
  const error = await f.post('/household/reset', {}, { status: 409 });
  assert.equal(error.code, 'DEMO_ALREADY_CLEARED');
  assert.deepEqual(await f.state(), before);
});

test('dedicated SQLite storage persists stock, custom metadata and trip assignment on reopen', async (t) => {
  const f = await fixture(t);
  const category = await f.post('/categories', {
    name: 'Special ingredients',
    emoji: '🫙',
    color: '#556677',
  });
  const provider = await f.post('/providers', {
    name: 'Local co-op',
    color: '#665544',
    notes: 'Tuesday pickup',
  });
  const partner = await f.post('/members', { name: 'Partner', color: '#AA7788' });
  const product = await f.product('Tahini', {
    categoryId: category.id,
    preferredProviderId: provider.id,
    minQuantity: 0.5,
  });
  await f.post('/stock', {
    productId: product.id,
    locationId: 'pantry',
    quantity: 1.125,
    expiresAt: '2031-05-01',
  });
  const list = await f.post('/lists', {
    name: 'Tuesday pickup',
    date: '2030-06-11',
    memberId: partner.id,
  });
  await f.post(`/lists/${list.id}/items`, {
    productId: product.id,
    quantity: 0.25,
    providerId: provider.id,
  });
  const before = await f.state();
  await f.stop();
  const reopened = createStore(f.dbPath);
  try {
    const after = JSON.parse(JSON.stringify(reopened.state()));
    assert.deepEqual(after, before);
    assert.equal(after.household.demo, false);
    assert.equal(after.inventory.length, 1, 'Reopening must not seed the demo again');
  } finally {
    reopened.close();
  }
});
