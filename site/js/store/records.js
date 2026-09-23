import { mergeRecords } from '../domain/merge.js';
export const upsertRecords = (store, path, records, message = `save ${path}`) =>
  store.update(path, (cur) => mergeRecords(cur || [], records), message);
