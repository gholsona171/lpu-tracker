// Public check-in Worker. A localStorage override lets local testing point at a mock.
const DEFAULT_WORKER_URL = 'https://lpu-checkin.gholsona241171.workers.dev';

function override() {
  try { return localStorage.getItem('lpu.worker'); } catch { return null; }
}

export const WORKER_URL = override() || DEFAULT_WORKER_URL;

// Folder the app is served from, e.g. https://gholsona171.github.io/lpu-tracker/
export const SITE_URL = location.origin + location.pathname.replace(/[^/]*$/, '');

export const checkinUrl = (event) =>
  `${SITE_URL}checkin.html?e=${encodeURIComponent(event.id)}&k=${encodeURIComponent(event.eventKey)}`;
