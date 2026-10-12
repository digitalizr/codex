import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import express from 'express';
import { createApi } from '../server/api.mjs';
import { createStore } from '../server/db.mjs';
import { getReleaseMetadata } from '../server/release.mjs';

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const commit = '0123456789abcdef0123456789abcdef01234567';

test('release defaults come from the package and do not infer production from NODE_ENV', () => {
  const local = { version: packageVersion, commit: null, environment: 'local' };
  assert.deepEqual(getReleaseMetadata({}), local);
  assert.deepEqual(getReleaseMetadata({ NODE_ENV: 'production' }), local);
  assert.deepEqual(
    getReleaseMetadata({ HEARTH_ENVIRONMENT: 'local', NODE_ENV: 'production' }),
    local,
  );
});

test('explicit production metadata preserves the complete release commit', () => {
  assert.deepEqual(
    getReleaseMetadata({
      HEARTH_ENVIRONMENT: 'production',
      HEARTH_COMMIT: commit,
      NODE_ENV: 'development',
    }),
    { version: packageVersion, commit, environment: 'production' },
  );
});

test('malformed release commits are never exposed as release metadata', () => {
  for (const malformed of [
    '',
    commit.slice(0, 7),
    commit.slice(0, 39),
    `${commit}0`,
    commit.toUpperCase(),
    `${commit.slice(0, 39)}g`,
    ` ${commit}`,
    `${commit}\n`,
    'secret-or-household-data',
  ]) {
    assert.deepEqual(
      getReleaseMetadata({ HEARTH_COMMIT: malformed, HEARTH_ENVIRONMENT: 'production' }),
      { version: packageVersion, commit: null, environment: 'production' },
      `Malformed commit was accepted: ${JSON.stringify(malformed)}`,
    );
  }
});

test('environment labels are restricted to local and production without exposing other variables', () => {
  for (const invalid of ['', 'staging', 'Production', ' production ', 'private-household-name']) {
    assert.deepEqual(
      getReleaseMetadata({
        HEARTH_ENVIRONMENT: invalid,
        HEARTH_COMMIT: commit,
        NODE_ENV: 'production',
        DATABASE_URL: 'private-database-credential',
        GITHUB_TOKEN: 'private-token',
        VERSION: 'not-the-package-version',
      }),
      { version: packageVersion, commit, environment: 'local' },
    );
  }
});

test('GET /api/version returns only metadata independently of household and selected member', async (t) => {
  const store = createStore(':memory:');
  store.run('UPDATE household SET name=?', 'Private household marker');
  store.run('UPDATE members SET name=name || ?', ' private member marker');
  store.run('UPDATE products SET name=name || ?', ' private inventory marker');
  let householdAccesses = 0;
  for (const method of ['get', 'all', 'run', 'state', 'export']) {
    store[method] = () => {
      householdAccesses += 1;
      throw new Error('Release metadata must not read or write household records.');
    };
  }
  const app = express();
  app.use('/api', createApi(store));
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  });
  await once(server, 'listening');
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/version?include=household&include=inventory`,
    { headers: { 'X-Member-Id': 'missing-member' } },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json\b/);
  const metadata = await response.json();
  assert.deepEqual(metadata, getReleaseMetadata());
  assert.deepEqual(Object.keys(metadata).sort(), ['commit', 'environment', 'version']);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /Private household|private member|private inventory/,
  );
  assert.equal(householdAccesses, 0);
});

test('GET /api/version uses the runtime release variables without exposing injected secrets', () => {
  const apiUrl = new URL('../server/api.mjs', import.meta.url).href;
  const dbUrl = new URL('../server/db.mjs', import.meta.url).href;
  const script = `
    import express from 'express';
    import { once } from 'node:events';
    import { createApi } from ${JSON.stringify(apiUrl)};
    import { createStore } from ${JSON.stringify(dbUrl)};
    const store = createStore(':memory:');
    const app = express();
    app.use('/api', createApi(store));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/version');
      process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      store.close();
    }
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      HEARTH_ENVIRONMENT: 'production',
      HEARTH_COMMIT: commit,
      NODE_ENV: 'development',
      GROCERY_DB_PATH: '/private/household.sqlite',
      DATABASE_URL: 'private-database-credential',
      GITHUB_TOKEN: 'private-token',
    },
  });
  assert.deepEqual(JSON.parse(output), {
    status: 200,
    body: { version: packageVersion, commit, environment: 'production' },
  });
  assert.doesNotMatch(output, /private\/household|private-database|private-token/);
});
