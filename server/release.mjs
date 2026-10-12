import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function getReleaseMetadata(env = process.env) {
  const commit =
    typeof env.HEARTH_COMMIT === 'string' && /^[a-f0-9]{40}$/.test(env.HEARTH_COMMIT)
      ? env.HEARTH_COMMIT
      : null;
  return {
    version,
    commit,
    environment: env.HEARTH_ENVIRONMENT === 'production' ? 'production' : 'local',
  };
}
