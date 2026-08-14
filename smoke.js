// smoke.js — verify the packaged dsh host boots (no GUI required).
// Runs the unpacked dsh bin under ELECTRON_RUN_AS_NODE + --expose-internals
// and asserts the host prints its "dsh web: http://..." readiness line.
// Usage: node smoke.js   (from the project root, after electron-builder)
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findUnpackedDirs() {
  const out = [];
  if (!fs.existsSync('dist')) return out;
  for (const d of fs.readdirSync('dist')) {
    const full = path.join('dist', d);
    try {
      if (fs.statSync(full).isDirectory() && (d.endsWith('-unpacked') || d.startsWith('mac'))) out.push(full);
    } catch (_) {}
  }
  return out;
}

function findElectronBinary(dir) {
  const execName = 'dsh-desktop'; // package.json "name" — electron-builder's Linux/macOS executable
  try {
    if (process.platform === 'win32') {
      const exes = fs.readdirSync(dir).filter((f) => f.endsWith('.exe') && !/Setup|Update|crashpad/i.test(f));
      const main = exes.find((f) => /dsh-desktop|DeepSeek/i.test(f)) || exes[0];
      return main ? path.join(dir, main) : null;
    }
    if (process.platform === 'darwin') {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.app')) continue;
        const macos = path.join(dir, f, 'Contents', 'MacOS');
        if (!fs.existsSync(macos)) continue;
        const exe = fs.readdirSync(macos).find((x) => !x.endsWith('.dSYM'));
        if (exe) return path.join(macos, exe);
      }
      return null;
    }
    // linux: the main binary is named after the package, not the sandbox helpers
    for (const f of fs.readdirSync(dir)) {
      if (f === execName) return path.join(dir, f);
    }
  } catch (_) {}
  return null;
}

function findDshBin(dir) {
  const candidates = [
    path.join(dir, 'resources', 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(dir, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function runSmoke(electronBin, dshBin, home) {
  return new Promise((resolve) => {
    const child = spawn(electronBin, ['--expose-internals', dshBin, '--profile', 'desktop', '--host', '127.0.0.1', '--port', '0'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let matched = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 45000);
    child.stdout.on('data', (c) => {
      const t = c.toString();
      process.stdout.write(`[smoke] ${t}`);
      if (/dsh web: http:/.test(t)) {
        matched = true;
        child.kill('SIGTERM');
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.stderr.on('data', (c) => process.stderr.write(`[smoke:err] ${c}`));
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(matched);
    });
  });
}

function ensureProfile(home) {
  const target = path.join(home, 'profiles', 'desktop');
  const src = path.join(process.cwd(), 'profiles', 'desktop');
  fs.mkdirSync(target, { recursive: true });
  for (const f of ['package.json', 'cordis.patch.yml']) {
    fs.copyFileSync(path.join(src, f), path.join(target, f));
  }
}

async function main() {
  const dirs = findUnpackedDirs();
  if (dirs.length === 0) {
    console.error('smoke: no unpacked dir under dist/');
    process.exit(1);
  }
  for (const dir of dirs) {
    const electronBin = findElectronBinary(dir);
    const dshBin = findDshBin(dir);
    if (!electronBin || !dshBin) {
      console.log(`smoke: skip ${dir} (no electron/dsh bin)`);
      continue;
    }
    console.log(`smoke: testing ${dir}\n  electron=${electronBin}\n  dsh=${dshBin}`);
    const home = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dsh-smoke-'));
    ensureProfile(home);
    const ok = await runSmoke(electronBin, dshBin, home);
    if (ok) {
      console.log('smoke OK');
      process.exit(0);
    }
  }
  console.error('smoke FAILED: host did not print its readiness line');
  process.exit(1);
}

main();
