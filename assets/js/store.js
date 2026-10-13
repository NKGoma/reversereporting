/*
 * Lokaler Speicher im Browser (IndexedDB): Archive mit Volltext und der Gemma-Cache.
 * Bleibt auf dem Gerät. Ohne IndexedDB (z. B. privates Fenster) wird nur im Speicher gehalten.
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const DB = "reverse-reporting", VERSION = 1, STORES = ["corpus", "cache"];
  const mem = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  let dbp = null;

  function open() {
    if (!dbp) {
      dbp = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB, VERSION);
          req.onupgradeneeded = () => STORES.forEach((s) => { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    if (!db) return fn(null);
    return new Promise((resolve) => {
      try {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
        t.onerror = t.onabort = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    });
  }

  RR.store = {
    async get(store, key) {
      if (mem[store].has(key)) return mem[store].get(key);
      const v = await tx(store, "readonly", (os) => os && os.get(key));
      if (v !== undefined) mem[store].set(key, v);
      return v;
    },
    async put(store, key, value) {
      mem[store].set(key, value);
      await tx(store, "readwrite", (os) => os && os.put(value, key));
    },
    async del(store, key) {
      mem[store].delete(key);
      await tx(store, "readwrite", (os) => os && os.delete(key));
    },
    async clear(store) {
      mem[store].clear();
      await tx(store, "readwrite", (os) => os && os.clear());
    },
    async count(store) {
      const n = await tx(store, "readonly", (os) => os && os.count());
      return n == null ? mem[store].size : n;
    },
    async persistent() { return !!(await open()); },
  };
})();
