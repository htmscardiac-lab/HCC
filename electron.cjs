const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const CURRENT_VERSION = app.getVersion()

function parseVersion(v) {
  const parts = (v || '0.0.0').split('.').map(Number)
  return (parts[0]||0)*10000 + (parts[1]||0)*100 + (parts[2]||0)
}

function findUpdate() {
  for (let i = 68; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\'
    try {
      if (!fs.existsSync(drive)) continue
      const files = fs.readdirSync(drive).filter(f =>
        f.startsWith('HTMS Platform Setup') && f.endsWith('.exe')
      )
      for (const file of files) {
        const match = file.match(/(\d+\.\d+\.\d+)/)
        if (match) {
          const usbVer = match[1]
          if (parseVersion(usbVer) > parseVersion(CURRENT_VERSION)) {
            return { path: path.join(drive, file), version: usbVer }
          }
        }
      }
    } catch (e) { /* drive not accessible */ }
  }
  return null
}

async function checkForUpdate(win) {
  const update = findUpdate()
  if (!update) return

  // Focus window before showing dialog to avoid focus loss
  win.focus()

  const res = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'تحديث متوفر — HTMS Platform',
    message: 'تم اكتشاف إصدار جديد على الـ USB',
    detail:
      'الإصدار الحالي:  v' + CURRENT_VERSION + '\n' +
      'الإصدار الجديد:  v' + update.version + '\n\n' +
      'هل تريد تثبيت التحديث الآن؟\n' +
      'سيُغلق البرنامج ويبدأ التثبيت تلقائياً.',
    buttons: ['تثبيت التحديث الآن', 'لاحقاً'],
    defaultId: 0,
    cancelId: 1
  })

  // *** KEY FIX: restore focus to the window after dialog closes ***
  win.focus()
  win.webContents.focus()

  if (res.response === 0) {
    execFile(update.path, [], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
  }
}

function getIconPath() {
  const locations = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, 'public', 'icon.png'),
    path.join(__dirname, 'icon.png'),
  ]
  for (const loc of locations) {
    try { if (fs.existsSync(loc)) return loc } catch (e) {}
  }
  return null
}

function createWindow() {
  const iconPath = getIconPath()
  const winOptions = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Fix: enable focus on window even after dialogs
      backgroundThrottling: false,
    },
    title: 'HTMS Platform v' + CURRENT_VERSION + ' — MNGHA | HTMS',
    autoHideMenuBar: true,
  }

  if (iconPath) winOptions.icon = iconPath

  const win = new BrowserWindow(winOptions)

  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
    : path.join(__dirname, 'dist', 'index.html')

  win.loadFile(indexPath)

  // *** FIX 1: Restore focus whenever window is shown or focused ***
  win.on('focus', () => {
    win.webContents.focus()
  })

  // *** FIX 2: After page finishes loading, ensure it has focus ***
  win.webContents.on('did-finish-load', () => {
    win.focus()
    win.webContents.focus()
  })

  // *** FIX 3: When user clicks on window, restore focus to webContents ***
  win.on('restore', () => {
    win.webContents.focus()
  })

  // *** FIX 4: Periodically check if webContents lost focus and restore it ***
  // This handles the case where dialog or external event steals focus
  win.webContents.on('before-input-event', (event, input) => {
    // If we receive input but webContents doesn't think it's focused, fix it
    if (!win.webContents.isFocused()) {
      win.webContents.focus()
    }
  })

  // Check USB for update 4 seconds after launch
  setTimeout(() => checkForUpdate(win), 4000)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
