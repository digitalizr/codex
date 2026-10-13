import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/db.mjs';

function fixture(t, { legacy = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hearth-profile-migration-'));
  const dbPath = join(directory, 'household.sqlite');
  let store = createStore(dbPath);
  if (legacy) {
    store.run('UPDATE members SET name=? WHERE id=?', 'You', 'member-you');
    store.run('DELETE FROM members WHERE id=?', 'member-wife');
    store.run('UPDATE activity SET member_name=?', 'You');
    store.db.exec('DROP TABLE IF EXISTS app_migrations');
  }
  t.after(() => {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = undefined;
      store = createStore(dbPath);
      return store;
    },
  };
}

function nonMemberRows(store) {
  return Object.fromEntries(
    [
      'household',
      'categories',
      'locations',
      'providers',
      'products',
      'batches',
      'lists',
      'items',
      'activity',
    ].map((table) => [table, store.all(`SELECT * FROM ${table} ORDER BY rowid`)]),
  );
}

test('new households start with Mohan and Sunita and attribute starter history to Mohan', (t) => {
  const f = fixture(t, { legacy: false });
  const before = f.store.export();
  assert.deepEqual(
    before.members.map(({ id, name }) => ({ id, name })),
    [
      { id: 'member-you', name: 'Mohan' },
      { id: 'member-wife', name: 'Sunita' },
    ],
  );
  assert.ok(before.activity.length > 0);
  assert.ok(before.activity.every((event) => event.memberName === 'Mohan'));
  assert.equal(f.store.get('PRAGMA user_version').user_version, 1);
  assert.deepEqual(f.reopen().export(), before);
});

test('startup renames legacy profiles in place without changing assignments, stock or history', (t) => {
  const f = fixture(t);
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'legacy-wife-uuid', 'Wife', '#654321');
  f.store.run(
    'INSERT INTO lists VALUES (?,?,?,?,?,?,?)',
    'partner-shopping-trip',
    'Partner shop',
    '2030-01-02',
    'legacy-wife-uuid',
    'planned',
    'Preserve the assigned partner',
    '2030-01-01T10:00:00.000Z',
  );
  f.store.run(
    'INSERT INTO activity VALUES (?,?,?,?,?,?,?,?,?,?)',
    'legacy-wife-activity',
    'rice',
    'Basmati rice',
    '🍚',
    'added',
    0.25,
    'kg',
    'Wife',
    'Pantry',
    '2030-01-01T10:00:00.000Z',
  );
  f.store.run('UPDATE household SET demo=0');
  const beforeRows = nonMemberRows(f.store);
  const beforeMembers = f.store.all('SELECT * FROM members ORDER BY rowid');
  const migrated = f.reopen();

  assert.deepEqual(
    migrated.all('SELECT * FROM members ORDER BY rowid').map((member) => ({ ...member })),
    beforeMembers.map((member) => ({
      ...member,
      name: member.name === 'You' ? 'Mohan' : 'Sunita',
    })),
  );
  assert.equal(migrated.get('PRAGMA user_version').user_version, 1);
  assert.equal(
    migrated.get('SELECT member_id FROM lists WHERE id=?', 'weekly-restock').member_id,
    'member-you',
  );
  assert.deepEqual(nonMemberRows(migrated), beforeRows);
  assert.equal(
    migrated.get('SELECT member_id FROM lists WHERE id=?', 'partner-shopping-trip').member_id,
    'legacy-wife-uuid',
  );
  assert.deepEqual(
    [...new Set(migrated.state().activity.map((event) => event.memberName))].sort(),
    ['Wife', 'You'],
  );

  const beforeSecondStartup = migrated.export();
  assert.deepEqual(f.reopen().export(), beforeSecondStartup);
  assert.deepEqual(nonMemberRows(f.store), beforeRows);
});

test('startup preserves customized default names, custom You IDs and lowercase wife profiles', (t) => {
  const f = fixture(t);
  f.store.run('UPDATE members SET name=? WHERE id=?', 'Alex', 'member-you');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-you-profile', 'You', '#123456');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-wife-profile', 'wife', '#654321');
  const before = f.store.export();

  assert.deepEqual(f.reopen().export(), before);
  assert.deepEqual(f.reopen().export(), before);
});

test('existing case-insensitive target names make profile renames safe no-ops', (t) => {
  const f = fixture(t);
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-mohan-profile', 'mOhAn', '#987654');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'legacy-wife-profile', 'Wife', '#654321');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-sunita-profile', 'sUnItA', '#123456');
  const before = f.store.export();

  assert.deepEqual(f.reopen().export(), before);
  assert.equal(f.store.get('SELECT name FROM members WHERE id=?', 'member-you').name, 'You');
  assert.deepEqual(f.reopen().export(), before);
});

test('a conflicting owner name does not block a safe partner rename', (t) => {
  const f = fixture(t);
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-mohan-profile', 'MOHAN', '#987654');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'legacy-wife-profile', 'Wife', '#654321');
  const beforeRows = nonMemberRows(f.store);
  const migrated = f.reopen();

  assert.equal(migrated.get('SELECT name FROM members WHERE id=?', 'member-you').name, 'You');
  assert.equal(
    migrated.get('SELECT name FROM members WHERE id=?', 'custom-mohan-profile').name,
    'MOHAN',
  );
  assert.equal(
    migrated.get('SELECT name FROM members WHERE id=?', 'legacy-wife-profile').name,
    'Sunita',
  );
  assert.equal(migrated.get('SELECT count(*) AS n FROM members').n, 3);
  assert.deepEqual(nonMemberRows(migrated), beforeRows);
});

test('placeholder matching is exact even though member name uniqueness is case-insensitive', (t) => {
  const f = fixture(t);
  f.store.run('UPDATE members SET name=? WHERE id=?', 'you', 'member-you');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'custom-wife-profile', 'wife', '#654321');
  const before = f.store.export();

  assert.deepEqual(f.reopen().export(), before);
});

test('a legacy household without a partner receives Sunita without overwriting its custom owner', (t) => {
  const f = fixture(t);
  f.store.run('UPDATE members SET name=? WHERE id=?', 'Alex', 'member-you');
  const beforeOwner = f.store.get('SELECT * FROM members WHERE id=?', 'member-you');
  const beforeRows = nonMemberRows(f.store);
  const migrated = f.reopen();

  assert.deepEqual(migrated.get('SELECT * FROM members WHERE id=?', 'member-you'), beforeOwner);
  assert.equal(migrated.get('SELECT name FROM members WHERE id=?', 'member-wife').name, 'Sunita');
  assert.equal(migrated.get('SELECT count(*) AS n FROM members').n, 2);
  assert.deepEqual(nonMemberRows(migrated), beforeRows);
  assert.equal(migrated.get('PRAGMA user_version').user_version, 1);
  const beforeSecondStartup = migrated.export();
  assert.deepEqual(f.reopen().export(), beforeSecondStartup);
});

test('a custom profile occupying the partner ID prevents inserting a duplicate default', (t) => {
  const f = fixture(t);
  f.store.run('UPDATE members SET name=? WHERE id=?', 'Alex', 'member-you');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'member-wife', 'Rebecca', '#654321');
  const before = f.store.export();

  assert.deepEqual(f.reopen().export(), before);
  assert.deepEqual(f.reopen().export(), before);
});

test('subsequent startups preserve user edits and never restore a deleted partner profile', (t) => {
  const f = fixture(t);
  f.reopen();
  assert.equal(f.store.get('SELECT name FROM members WHERE id=?', 'member-you').name, 'Mohan');
  assert.equal(f.store.get('SELECT name FROM members WHERE id=?', 'member-wife').name, 'Sunita');

  f.store.run('UPDATE members SET name=? WHERE id=?', 'You', 'member-you');
  f.store.run('DELETE FROM members WHERE id=?', 'member-wife');
  f.store.run('INSERT INTO members VALUES (?,?,?)', 'later-custom-wife', 'Wife', '#654321');
  const before = f.store.export();

  assert.deepEqual(f.reopen().export(), before);
  assert.deepEqual(f.reopen().export(), before);
  assert.equal(f.store.get('SELECT count(*) AS n FROM members WHERE id=?', 'member-wife').n, 0);
});
