import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, mkdir, open, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const manifestDirectory = fileURLToPath(new URL('../', import.meta.url));
const pending = new Map();

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 2, 2], windowsHide: true, ...options });
    const timer = setTimeout(() => child.kill(), 600_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error(`Setup command failed (exit ${code ?? 'timeout'}). Check network access and retry the skill.`));
    });
  });
}

// Use npm's JS entrypoint on Windows: no shell interpolation, even in paths with spaces.
async function installNpm(directory) {
  const candidates = [process.env.npm_execpath, ...[path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter)]
    .filter(Boolean).map(dir => path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))];
  for (const candidate of candidates) {
    if (!candidate || path.basename(candidate) !== 'npm-cli.js') continue;
    try { await access(candidate); } catch { continue; }
    return runProcess(process.execPath, [candidate, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
  }
  if (process.platform === 'win32') throw Error('npm is required for first-run setup. Install Node.js with npm, then retry the skill.');
  return runProcess('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
}

export async function withFileLock(file, action, { timeout = 660_000 } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const token = randomUUID(), started = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
    } catch (error) {
      if (handle) { await handle.close(); await rm(file, { force: true }); throw error; }
      if (error.code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - (await stat(file)).mtimeMs;
        const owner = JSON.parse(await readFile(file, 'utf8'));
        if (age > 1000) {
          try { process.kill(owner.pid, 0); } catch (cause) { if (cause.code === 'ESRCH') { await rm(file, { force: true }); continue; } }
        }
      } catch (cause) {
        if (cause.code === 'ENOENT') continue;
        // A process can exit between creating the lock and writing its owner.
        if (cause instanceof SyntaxError && Date.now() - (await stat(file).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 30_000) {
          await rm(file, { force: true }); continue;
        }
      }
      if (Date.now() - started > timeout) throw Error('Another skill is still setting up dependencies. Retry when it finishes.');
      await delay(100);
    }
  }
  try { return await action(); } finally {
    await handle.close();
    const owner = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
    if (owner.token === token) await rm(file, { force: true });
  }
}

export async function ensureDependencies({ source = manifestDirectory, cacheRoot = process.env.CODE_UNPACKED_CACHE, install = installNpm } = {}) {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && (minor < 23 || (minor === 23 && patch < 4)))) throw Error('Code Unpacked requires Node.js 22.23.4 or later. Update Node.js, then retry the skill.');
  const [manifest, lock] = await Promise.all(['package.json', 'package-lock.json'].map(file => readFile(path.join(source, file), 'utf8')));
  const digest = createHash('sha256').update(manifest).update(lock).digest('hex');
  const base = cacheRoot || path.join(process.platform === 'win32' ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local') : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'code-unpacked');
  const directory = path.resolve(base, 'dependencies', `${process.platform}-${process.arch}-${digest.slice(0, 20)}`);
  if (pending.has(directory)) return pending.get(directory);
  const promise = withFileLock(`${directory}.lock`, async () => {
    const packages = JSON.parse(manifest).dependencies;
    let complete = await readFile(path.join(directory, '.ready'), 'utf8').catch(() => '');
    if (complete === digest) {
      for (const [name, version] of Object.entries(packages)) {
        const installed = await readFile(path.join(directory, 'node_modules', name, 'package.json'), 'utf8').then(JSON.parse).catch(() => ({}));
        if (installed.version !== version) { complete = ''; break; }
      }
    }
    if (complete !== digest) {
      console.error('Code Unpacked: setting up rendering dependencies (first use).');
      await mkdir(directory, { recursive: true });
      await rm(path.join(directory, '.ready'), { force: true });
      await Promise.all([writeFile(path.join(directory, 'package.json'), manifest), writeFile(path.join(directory, 'package-lock.json'), lock)]);
      await install(directory);
      for (const [name, version] of Object.entries(packages)) {
        const installed = JSON.parse(await readFile(path.join(directory, 'node_modules', name, 'package.json'), 'utf8'));
        if (installed.version !== version) throw Error(`Setup did not install ${name}@${version}; retry the skill.`);
      }
      await writeFile(path.join(directory, '.ready'), digest);
    }
    return directory;
  });
  pending.set(directory, promise);
  try { return await promise; } finally { pending.delete(directory); }
}

export async function resolveDependency(name) {
  const directory = await ensureDependencies();
  return createRequire(path.join(directory, 'package.json')).resolve(name);
}

export async function importDependency(name) {
  const module = await import(pathToFileURL(await resolveDependency(name)).href);
  // CJS packages do not consistently expose named exports through dynamic import.
  return module.default && typeof module.default === 'object' ? { ...module.default, ...module } : module;
}
