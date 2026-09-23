export function createMemoryStore(initial = {}) {
  const files = structuredClone(initial);
  return {
    files,
    async readJson(path) {
      return path in files ? { data: structuredClone(files[path]), sha: 'mem' } : { data: null, sha: null };
    },
    async update(path, fn) {
      const next = fn(path in files ? structuredClone(files[path]) : null);
      if (next === null || next === undefined) return null;
      files[path] = structuredClone(next);
      return next;
    },
    async listDir(dir) {
      const prefix = dir.replace(/\/?$/, '/');
      return Object.keys(files).filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}
