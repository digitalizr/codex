import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const deployScript = join(repository, 'ops', 'deploy.sh');
const previousImage = `hearth:${'a'.repeat(40)}`;
const nextImage = `hearth:${'b'.repeat(40)}`;

const fakeDocker = String.raw`#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = process.env.FAKE_DOCKER_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
const composePathIndex = args.findIndex((value) => value === '-f' || value === '--file');
const composePath = composePathIndex >= 0 ? args[composePathIndex + 1] : null;
const envText = args.flatMap((value, index) => value === '--env-file' && existsSync(args[index + 1]) ? [readFileSync(args[index + 1], 'utf8')] : []).join('\n');
const imageMatch = [...envText.matchAll(/^HEARTH_IMAGE=(.*)$/gm)].at(-1);
const image = process.env.HEARTH_IMAGE || (imageMatch ? imageMatch[1].replace(/^['"]|['"]$/g, '') : '') || state.previousImage;
const config = composePath && existsSync(composePath) ? readFileSync(composePath, 'utf8') : null;
const markerPath = join(process.env.HEARTH_INSTALL_DIR, 'current-image.env');
const marker = existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : null;
const record = { args, image, config, marker };
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify(record) + '\n');

function save() { writeFileSync(file, JSON.stringify(state)); }
function done(output = '', status = 0) { save(); process.stdout.write(output); process.exit(status); }
function fail(message) { save(); process.stderr.write(message + '\n'); process.exit(1); }

if (args[0] === 'info' && args.join(' ').includes('.DockerRootDir')) done(process.env.FAKE_DOCKER_VOLUME + '\n');
if (args[0] === 'info' || args[0] === 'version') done('Fake Docker\n');
if (args[0] === 'load') { state.loaded = true; done('Loaded image\n'); }
if (args[0] === 'image' && args[1] === 'inspect') {
  const format = args[args.indexOf('--format') + 1] || '';
  const requestedImage = args.at(-1);
  if (requestedImage !== state.previousImage && !state.loaded) done('', 1);
  if (format.includes('.Id')) done('sha256:' + (requestedImage === state.previousImage ? '1' : '2').repeat(64) + '\n');
  if (format.includes('.Os') && format.includes('.Architecture')) done('linux/arm64\n');
  if (format.includes('.Architecture')) done('arm64\n');
  if (format.includes('.Os')) done('linux\n');
  done(JSON.stringify([{ Architecture: 'arm64', Os: 'linux' }]) + '\n');
}
if (args[0] === 'inspect') {
  const health = state.unhealthy && state.runningImage !== state.previousImage ? 'unhealthy' : 'healthy';
  if (args.join(' ').includes('.Config.Image')) done(state.runningImage + '\n');
  if (args.join(' ').includes('.State.Status')) done((state.running ? 'running' : 'exited') + '|' + health + '\n');
  if (args.join(' ').includes('.State.Health.Status')) done(health + '\n');
  if (args.join(' ').includes('.State.Running')) done(String(state.running) + '\n');
  done(JSON.stringify([{ State: { Running: state.running, Health: { Status: health } } }]) + '\n');
}
if (args[0] === 'ps') {
  if (args.some((value) => value.includes('volume=hearth-production-data'))) done(state.volumeWriter ? 'other-writer\n' : state.running ? 'fake-hearth\n' : '');
  if (args.some((value) => value.includes('service=caddy'))) done('');
  done(state.containerExists ? 'fake-hearth\n' : '');
}
if (args[0] === 'volume' && args[1] === 'inspect') {
  done(JSON.stringify([{ Name: 'hearth-data', Mountpoint: process.env.FAKE_DOCKER_VOLUME }]) + '\n');
}
if (args[0] === 'run') {
  if (state.backupFails) fail('Simulated backup failure');
  const backupMount = args.find((value) => value.includes(':/backup') || value.includes('dst=/backup'));
  if (backupMount) {
    const backupDir = backupMount.includes('src=') ? backupMount.match(/src=([^,]+)/)[1] : backupMount.split(':/backup')[0];
    const command = args.join(' ');
    const destination = command.match(/\/backup\/[a-zA-Z0-9._/-]+/g)?.find((value) => /\.(?:tar\.gz|tgz)(?:\.partial)?$/.test(value)) || args.find((value) => /\.(?:tar\.gz|tgz)\.partial$/.test(value));
    if (destination) {
      const archive = join(backupDir, destination.replace(/^\/backup\//, ''));
      mkdirSync(dirname(archive), { recursive: true });
      const result = spawnSync('/usr/bin/tar', ['-czf', archive, '-C', process.env.FAKE_DOCKER_VOLUME, '.']);
      if (result.status !== 0) fail('Fake backup creation failed');
    }
  }
  done();
}
if (args[0] === 'compose') {
  if (args.includes('version')) done('Docker Compose version v2.39.0\n');
  if (args.includes('config')) done(JSON.stringify({ services: { hearth: { image } } }) + '\n');
  if (args.includes('stop')) { state.running = false; done(); }
  if (args.includes('ps')) {
    if (args.includes('--format') && args.includes('json')) {
      done(JSON.stringify([{ Service: 'hearth', State: state.running ? 'running' : 'exited', Health: state.unhealthy && state.runningImage !== state.previousImage ? 'unhealthy' : 'healthy' }]) + '\n');
    }
    done(state.running ? 'fake-hearth\n' : '');
  }
  if (args.includes('up') || args.includes('start')) {
    state.running = true;
    state.containerExists = true;
    state.runningImage = image;
    if (args.includes('--wait') && state.unhealthy && image !== state.previousImage) fail('Simulated unhealthy deployment');
    done();
  }
  if (args.includes('logs')) done('Fake container log\n');
  if (args.includes('down')) { state.running = false; done(); }
  if (args.includes('rm')) { state.running = false; state.containerExists = false; done(); }
}
fail('Unhandled fake Docker command: ' + args.join(' '));
`;

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hearth-deploy-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const install = join(directory, 'install');
  const stage = join(directory, 'stage');
  const bin = join(directory, 'bin');
  const volume = join(directory, 'volume');
  for (const path of [install, stage, bin, volume]) mkdirSync(path);
  const statePath = join(directory, 'docker-state.json');
  const logPath = join(directory, 'docker.log');
  writeFileSync(
    statePath,
    JSON.stringify({
      previousImage,
      running: false,
      runningImage: previousImage,
      containerExists: false,
      ...overrides,
    }),
  );
  writeFileSync(logPath, '');
  writeFileSync(join(volume, 'household.sqlite'), 'database must remain untouched');
  writeFileSync(join(bin, 'docker'), fakeDocker);
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(
    join(bin, 'uname'),
    '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo aarch64;; *) exit 1;; esac\n',
  );
  chmodSync(join(bin, 'uname'), 0o755);
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'sleep'), 0o755);
  writeFileSync(join(install, 'production.env'), 'HEARTH_PORT=3000\nHEARTH_EDGE_ENABLED=false\n');
  const stageCompose =
    '# new production config\nservices:\n  hearth:\n    image: ${HEARTH_IMAGE}\n';
  writeFileSync(join(stage, 'compose.production.yaml'), stageCompose);
  writeFileSync(
    join(stage, 'Caddyfile'),
    '# new proxy config\nhearth.example.test { reverse_proxy hearth:3000 }\n',
  );
  copyFileSync(deployScript, join(stage, 'deploy.sh'));
  const archiveSource = join(directory, 'image-content');
  mkdirSync(archiveSource);
  writeFileSync(join(archiveSource, 'manifest.json'), JSON.stringify([{ RepoTags: [nextImage] }]));
  const archive = join(stage, 'image.tar.gz');
  const archived = spawnSync('tar', ['-czf', archive, '-C', archiveSource, '.']);
  assert.equal(archived.status, 0, archived.stderr?.toString());
  const checksums = ['image.tar.gz', 'compose.production.yaml', 'Caddyfile', 'deploy.sh'].map(
    (filename) =>
      `${createHash('sha256')
        .update(readFileSync(join(stage, filename)))
        .digest('hex')}  ${filename}`,
  );
  writeFileSync(join(stage, 'SHA256SUMS'), checksums.join('\n') + '\n');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HEARTH_INSTALL_DIR: install,
    FAKE_DOCKER_STATE: statePath,
    FAKE_DOCKER_LOG: logPath,
    FAKE_DOCKER_VOLUME: volume,
  };
  return {
    directory,
    install,
    stage,
    volume,
    stageCompose,
    run: (image = nextImage) =>
      spawnSync('bash', [deployScript, stage, image], { env, encoding: 'utf8', timeout: 15_000 }),
    state: () => JSON.parse(readFileSync(statePath, 'utf8')),
    commands: () =>
      readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

function existingDeployment(f) {
  const compose = '# prior production config\nservices:\n  hearth:\n    image: ${HEARTH_IMAGE}\n';
  const caddy = '# prior proxy config\nhearth.example.test { reverse_proxy hearth:3000 }\n';
  writeFileSync(join(f.install, 'compose.production.yaml'), compose);
  writeFileSync(join(f.install, 'Caddyfile'), caddy);
  writeFileSync(join(f.install, 'current-image.env'), `HEARTH_IMAGE=${previousImage}\n`);
  return { compose, caddy };
}

function commandIndex(commands, command, image) {
  return commands.findIndex(
    (entry) => entry.args.includes(command) && (!image || entry.image === image),
  );
}

function assertDatabaseUntouched(f) {
  assert.equal(
    readFileSync(join(f.volume, 'household.sqlite'), 'utf8'),
    'database must remain untouched',
  );
  assert.ok(
    f
      .commands()
      .every(
        ({ args }) =>
          args[0] !== 'run' ||
          (!/\btar\b[^\n]*(?:\s-x|--extract)/.test(args.join(' ')) &&
            args
              .filter((argument) => argument.includes('hearth-production-data'))
              .every((mount) => mount.includes('readonly') || mount.endsWith(':ro'))),
      ),
    'deployment may read the database volume for backup, but must never restore or rewrite it',
  );
}

test('failed pre-deploy backup restarts the existing image without replacing its configuration', (t) => {
  const f = fixture(t, { backupFails: true, containerExists: true, running: true });
  const previous = existingDeployment(f);
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), true);
  const commands = f.commands();
  const stopped = commandIndex(commands, 'stop');
  const backup = commands.findIndex(({ args }) => args[0] === 'run');
  const restarted = commands.findIndex(
    (entry, index) =>
      index > backup &&
      entry.image === previousImage &&
      (entry.args.includes('up') || entry.args.includes('start')),
  );
  assert.ok(stopped >= 0 && backup > stopped, 'backup must run after the existing app stops');
  assert.ok(restarted > backup, 'a failed backup must restart the existing application');
  assert.equal(commandIndex(commands, 'up', nextImage), -1);
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, previousImage);
  assert.equal(readFileSync(join(f.install, 'compose.production.yaml'), 'utf8'), previous.compose);
  assert.equal(readFileSync(join(f.install, 'Caddyfile'), 'utf8'), previous.caddy);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${previousImage}\n`,
  );
  assertDatabaseUntouched(f);
});

test('an unhealthy update restores the prior image and configuration without restoring the database', (t) => {
  const f = fixture(t, { unhealthy: true, containerExists: true, running: true });
  const previous = existingDeployment(f);
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), true);
  const commands = f.commands();
  const updated = commandIndex(commands, 'up', nextImage);
  const rollback = commands.findIndex(
    (entry, index) => index > updated && entry.args.includes('up') && entry.image === previousImage,
  );
  assert.ok(updated >= 0, 'the new image must reach the health-check step');
  assert.ok(rollback > updated, 'an unhealthy image must trigger an application rollback');
  assert.equal(commands[rollback].config, previous.compose);
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, previousImage);
  assert.equal(readFileSync(join(f.install, 'compose.production.yaml'), 'utf8'), previous.compose);
  assert.equal(readFileSync(join(f.install, 'Caddyfile'), 'utf8'), previous.caddy);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${previousImage}\n`,
  );
  assertDatabaseUntouched(f);
});

test('an unhealthy first deployment leaves no successful current-image marker', (t) => {
  const f = fixture(t, { unhealthy: true });
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), true);
  assert.ok(commandIndex(f.commands(), 'up', nextImage) >= 0);
  assert.equal(existsSync(join(f.install, 'current-image.env')), false);
  assert.equal(f.state().running, false);
  assert.equal(f.state().containerExists, false);
  assertDatabaseUntouched(f);
});

test('a healthy first deployment records the immutable image only after startup', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), false);
  for (const filename of ['SHA256SUMS', 'compose.production.yaml', 'Caddyfile', 'deploy.sh']) {
    assert.equal(existsSync(join(f.stage, filename)), true);
  }
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, nextImage);
  assert.equal(f.commands()[commandIndex(f.commands(), 'up', nextImage)].marker, null);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${nextImage}\n`,
  );
  assert.equal(readFileSync(join(f.install, 'compose.production.yaml'), 'utf8'), f.stageCompose);
  assertDatabaseUntouched(f);
});

test('a cached immutable release is reused without importing an archive over the existing image', (t) => {
  const f = fixture(t, { containerExists: true, running: true });
  existingDeployment(f);
  const result = f.run(previousImage);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), false);
  assert.equal(
    f.commands().some(({ args }) => args[0] === 'load'),
    false,
  );
  assert.ok(commandIndex(f.commands(), 'up', previousImage) >= 0);
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, previousImage);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${previousImage}\n`,
  );
  assertDatabaseUntouched(f);
});

test('another container writing to the data volume blocks backup and restarts the prior app', (t) => {
  const f = fixture(t, { containerExists: true, running: true, volumeWriter: true });
  const previous = existingDeployment(f);
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), true);
  const commands = f.commands();
  const stopped = commandIndex(commands, 'stop');
  const writers = commands.findIndex(({ args }) =>
    args.some((argument) => argument.includes('volume=hearth-production-data')),
  );
  const restarted = commands.findIndex(
    (entry, index) => index > writers && entry.args.includes('up') && entry.image === previousImage,
  );
  assert.ok(stopped >= 0 && writers > stopped);
  assert.ok(restarted > writers);
  assert.equal(
    commands.some(({ args }) => args[0] === 'run'),
    false,
  );
  assert.equal(commandIndex(commands, 'up', nextImage), -1);
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, previousImage);
  assert.equal(readFileSync(join(f.install, 'compose.production.yaml'), 'utf8'), previous.compose);
  assert.equal(readFileSync(join(f.install, 'Caddyfile'), 'utf8'), previous.caddy);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${previousImage}\n`,
  );
  assertDatabaseUntouched(f);
});

test('a mismatched image checksum is rejected before importing the image or stopping the app', (t) => {
  const f = fixture(t, { containerExists: true, running: true });
  existingDeployment(f);
  writeFileSync(join(f.stage, 'image.tar.gz'), 'tampered image archive');
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(f.stage, 'image.tar.gz')), true);
  assert.equal(
    f.commands().some(({ args }) => args[0] === 'load'),
    false,
  );
  assert.equal(commandIndex(f.commands(), 'stop'), -1);
  assert.equal(f.state().running, true);
  assert.equal(f.state().runningImage, previousImage);
  assert.equal(
    readFileSync(join(f.install, 'current-image.env'), 'utf8'),
    `HEARTH_IMAGE=${previousImage}\n`,
  );
  assertDatabaseUntouched(f);
});

test('deployment contains no database-volume removal or blanket cache pruning commands', () => {
  const script = readFileSync(deployScript, 'utf8');
  assert.doesNotMatch(script, /docker\s+volume\s+(?:rm|prune)\b/);
  assert.doesNotMatch(script, /docker\s+system\s+prune\b/);
  assert.doesNotMatch(
    script,
    /docker\s+(?:builder|buildx)\s+prune\b[^\n]*(?:--all\b|(?:^|\s)-a\b)/m,
  );
  assert.doesNotMatch(script, /docker\s+image\s+prune\b[^\n]*(?:--all\b|(?:^|\s)-a\b)/m);
  assert.doesNotMatch(script, /\bdown\b[^\n]*(?:--volumes\b|(?:^|\s)-v\b)/m);
});
