import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

// Compose config is local-only: no daemon, image pulls, or application startup.
// Use empty fixture env files, never the developer's credentials.
const fixture = mkdtempSync(join(tmpdir(), 'oasm-compose-test-'));
after(() => rmSync(fixture, { recursive: true, force: true }));
copyFileSync('docker-compose.yml', join(fixture, 'docker-compose.yml'));
for (const dir of ['core-api', 'console', 'worker']) {
  mkdirSync(join(fixture, dir));
  writeFileSync(join(fixture, dir, '.env'), '');
}
const env = { ...process.env, COMPOSE_PROFILES: '', WORKER_DOCKER_GID: '1234' };
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${command} failed: ${result.error ?? result.stderr}`);
  return result.stdout + (command === 'task' ? result.stderr : '');
}
function config(profile = []) {
  return JSON.parse(run('docker', [
    'compose', '-f', join(fixture, 'docker-compose.yml'),
    '--env-file', join(fixture, 'core-api/.env'), ...profile, 'config', '--format', 'json',
  ], fixture));
}

function dependencies(services, target, selected = new Set()) {
  selected.add(target);
  for (const dependency of Object.keys(services[target].depends_on ?? {})) {
    if (!selected.has(dependency)) dependencies(services, dependency, selected);
  }
  return [...selected].sort();
}

test('app startup includes required infrastructure but no scanning worker', () => {
  const { services } = config();
  assert.equal(services['oasm-worker'], undefined);
  assert.deepEqual(dependencies(services, 'console'), [
    'console', 'core-api', 'geo-ip', 'migration', 'postgres', 'redis', 'rustfs',
  ]);
});

test('scan profile retains the single worker port, socket group and state', () => {
  const { services, volumes } = config(['--profile', 'scan']);
  const worker = services['oasm-worker'];
  assert.deepEqual(worker.profiles, ['scan']);
  assert.ok(worker.ports.some(port => port.published === '26276' && port.target === 26276));
  assert.deepEqual(worker.group_add, ['1234']);
  assert.ok(worker.volumes.some(volume => volume.source === 'worker-state' && volume.target === '/app/state'));
  assert.ok(Object.hasOwn(volumes, 'worker-state'));
  for (const [name, service] of Object.entries(services)) {
    assert.equal(service.restart, name === 'migration' ? 'no' : 'unless-stopped', name);
  }
});

test('task startup and stop commands keep resource decisions explicit', () => {
  const commands = Object.fromEntries([
    'docker-compose', 'docker-scan', 'docker-stop', 'docker-status', 'docker-config-check',
  ].map(name => [name, run('task', ['--dry', name], resolve('.'))]));
  assert.match(commands['docker-compose'], /up -d --build console/);
  assert.doesNotMatch(commands['docker-compose'], /oasm-worker|--force-recreate/);
  assert.match(commands['docker-scan'], /--profile scan up -d --build console oasm-worker/);
  assert.match(commands['docker-scan'], /export WORKER_DOCKER_GID/);
  assert.doesNotMatch(commands['docker-scan'], /--scale|--force-recreate/);
  assert.match(commands['docker-stop'], /--profile scan stop --timeout 30/);
  assert.doesNotMatch(commands['docker-stop'], /down|prune|--volumes/);
  assert.match(commands['docker-status'], /--profile scan ps --all/);
  assert.match(commands['docker-config-check'], /--profile scan config --quiet/);
});
