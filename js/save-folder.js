// Smart, auto-incrementing "FBToken<N>.png" filenames.
//
// Where supported (Chrome/Edge via the File System Access API), the user
// picks a folder once; we scan it directly for the highest existing
// FBToken<N>.png and write the next one straight into it. Where that API
// isn't available (Firefox/Safari), we fall back to a per-browser counter
// in localStorage — same naming, just not verified against files actually
// on disk, since the page has no way to read the Downloads folder.

TF.supportsFolderPicker = typeof window.showDirectoryPicker === 'function';
TF.folderHandle = null;

TF.DB_NAME = 'frame-buster-db';
TF.DB_STORE = 'handles';

TF._openDb = function () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TF.DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(TF.DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

TF.idbSet = async function (key, value) {
  const db = await TF._openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TF.DB_STORE, 'readwrite');
    tx.objectStore(TF.DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

TF.idbGet = async function (key) {
  const db = await TF._openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TF.DB_STORE, 'readonly');
    const req = tx.objectStore(TF.DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

// Must be called from a user-gesture handler (e.g. a button click).
TF.chooseSaveFolder = async function () {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  TF.folderHandle = handle;
  await TF.idbSet('saveFolder', handle);
  return handle;
};

// Reconnects a previously-chosen folder handle from IndexedDB, if any.
// Does not request permission (that needs a user gesture); it's only
// verified/re-requested later, inside the export click handler.
TF.restoreSaveFolder = async function () {
  if (!TF.supportsFolderPicker) return null;
  try {
    const handle = await TF.idbGet('saveFolder');
    if (handle) TF.folderHandle = handle;
    return handle || null;
  } catch (e) {
    return null;
  }
};

// Must be called from a user-gesture handler.
TF.ensureFolderPermission = async function () {
  if (!TF.folderHandle) return false;
  const opts = { mode: 'readwrite' };
  let perm = await TF.folderHandle.queryPermission(opts);
  if (perm === 'prompt') perm = await TF.folderHandle.requestPermission(opts);
  return perm === 'granted';
};

TF.findNextTokenNumber = async function (useFolder) {
  if (useFolder && TF.folderHandle) {
    let max = 0;
    for await (const [name] of TF.folderHandle.entries()) {
      const m = /^FBToken(\d+)\.png$/i.exec(name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  }
  const next = parseInt(localStorage.getItem('fbTokenCounter') || '0', 10) + 1;
  localStorage.setItem('fbTokenCounter', String(next));
  return next;
};

TF.getNextTokenFilename = async function (useFolder) {
  const n = await TF.findNextTokenNumber(useFolder);
  return `FBToken${n}.png`;
};

TF.saveBlobToFolder = async function (blob, filename) {
  const fileHandle = await TF.folderHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};
