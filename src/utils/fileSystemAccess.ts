type FileSystemHandlePermissionDescriptor = {
  mode: "read" | "readwrite";
};

export type CronoDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemFileHandle | CronoDirectoryHandle]>;
  requestPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  queryPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
};

type FileSystemWindow = Window & {
  showDirectoryPicker?: () => Promise<CronoDirectoryHandle>;
};

const DB_NAME = "crono-recordings";
const STORE_NAME = "handles";
const RECORDINGS_KEY = "recordings-directory";

function openRecordingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function supportsDirectoryPicker() {
  return typeof (window as FileSystemWindow).showDirectoryPicker === "function";
}

export async function pickRecordingsDirectory() {
  const picker = (window as FileSystemWindow).showDirectoryPicker;

  if (!picker) {
    throw new Error("Este navegador no permite elegir carpetas.");
  }

  const directory = await picker();
  await saveRecordingsDirectory(directory);
  return directory;
}

export async function saveRecordingsDirectory(directory: CronoDirectoryHandle) {
  const db = await openRecordingDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(directory, RECORDINGS_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

export async function getRecordingsDirectory() {
  const db = await openRecordingDb();

  const directory = await new Promise<CronoDirectoryHandle | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECORDINGS_KEY);

    request.onsuccess = () => resolve((request.result as CronoDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return directory;
}

export async function hasReadWritePermission(directory: CronoDirectoryHandle) {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };

  if (directory.queryPermission && (await directory.queryPermission(descriptor)) === "granted") {
    return true;
  }

  return Boolean(directory.requestPermission && (await directory.requestPermission(descriptor)) === "granted");
}
