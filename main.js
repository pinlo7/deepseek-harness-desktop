// DeepSeek Harness desktop shell.
// M0: spawn `dsh web` host + load it in a window (verified).
// M1: single-instance lock, tray residency, close-to-tray (host stays alive).
// M3: host runs as `ELECTRON_RUN_AS_NODE` against the unpacked dsh dependency,
//     so it needs no system Node and --expose-internals reaches dsh's loader.
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ---- config (env-overridable) ----
const DSH_PORT = process.env.DSH_PORT || '0'; // 0 => OS assigns a free port

let hostProcess = null;
let win = null;
let tray = null;
let hostUrl = null;
let quitting = false;

const PROFILE_TEMPLATE_DIR = path.join(__dirname, 'profiles', 'desktop');

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

// On first run on a fresh machine, seed the desktop profile from the bundled template.
function ensureDesktopProfile() {
  const targetDir = path.join(dshHome(), 'profiles', 'desktop');
  const manifest = path.join(targetDir, 'package.json');
  if (fs.existsSync(manifest)) return;
  if (!fs.existsSync(PROFILE_TEMPLATE_DIR)) return; // dev tree without bundled template
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of ['package.json', 'cordis.patch.yml']) {
    const from = path.join(PROFILE_TEMPLATE_DIR, file);
    const to = path.join(targetDir, file);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
  }
  console.log('[desktop] initialized desktop profile at', targetDir);
}

function resolveDshBin() {
  // Packaged: dsh is unpacked from the asar so a real Node can import it.
  const appPath = app.getAppPath();
  const unpackedAppPath = appPath.endsWith('.asar') ? `${appPath}.unpacked` : appPath;
  const candidates = [
    process.env.DSH_BIN,
    path.join(unpackedAppPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startHost() {
  const bin = resolveDshBin();
  if (!bin) {
    console.error('[desktop] dsh bin not found; set DSH_BIN to @deepseek-ai/dsh/lib/bin.js');
    quit();
    return;
  }
  console.log('[desktop] starting dsh host:', bin);
  const args = ['--expose-internals', bin, '--profile', 'desktop', '--host', '127.0.0.1', '--port', DSH_PORT];
  hostProcess = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  hostProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[dsh] ${text}`);
    // dsh prints "dsh web: http://127.0.0.1:<port>" once listening.
    if (!hostUrl) {
      const m = text.match(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
      if (m) {
        hostUrl = m[0];
        console.log('[desktop] host ready at', hostUrl);
        createWindow();
      }
    }
  });

  hostProcess.stderr.on('data', (chunk) => process.stderr.write(`[dsh:err] ${chunk}`));

  hostProcess.on('error', (err) => {
    console.error('[desktop] failed to spawn dsh host:', err.message);
    quit();
  });

  hostProcess.on('exit', (code, signal) => {
    console.log('[desktop] dsh host exited', { code, signal });
    hostProcess = null;
    if (!quitting) quit();
  });
}

function stopHost() {
  if (hostProcess) {
    try {
      hostProcess.kill('SIGTERM');
    } catch (_) {
      /* already gone */
    }
    hostProcess = null;
  }
}

function createWindow() {
  if (win) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(hostUrl);

  win.webContents.on('did-finish-load', async () => {
    console.log('[desktop] page loaded:', win.webContents.getURL());
    if (process.env.DSH_SCREENSHOT) {
      try {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(process.env.DSH_SCREENSHOT, image.toPNG());
        console.log('[desktop] screenshot saved:', process.env.DSH_SCREENSHOT);
      } catch (err) {
        console.error('[desktop] screenshot failed:', err.message);
      }
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[desktop] page load failed:', code, desc);
  });

  // Close button hides to the tray; the host (and session) stays alive.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('DeepSeek Harness');
  const menu = Menu.buildFromTemplate([
    { label: 'Show DeepSeek Harness', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showWindow());
}

function showWindow() {
  if (!win && hostUrl) createWindow();
  else if (win) {
    win.show();
    win.focus();
  }
}

function quit() {
  quitting = true;
  stopHost();
  app.quit();
}

// ---- single instance ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    ensureDesktopProfile();
    startHost();
    createTray();
  });
}

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (quitting) app.quit();
  // otherwise: stay resident in the tray.
});

app.on('will-quit', () => stopHost());
