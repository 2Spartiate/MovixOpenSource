import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const routesSource = readFileSync(new URL('../API/Mainapi/commentsRoutes.js', import.meta.url), 'utf8');
const sendPushSource = routesSource.slice(
  routesSource.indexOf('async function sendPushToUser('),
  routesSource.indexOf('async function createNotification('),
);
const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const OLD_ORIGIN = 'https://movix-old.test';
const NEW_ORIGIN = 'https://movix-new.test';

async function sendPush(frontendUrl, data = { contentType: 'movie', contentId: 1212763 }) {
  const sent = [];
  const queries = [];
  const subscription = { endpoint: 'https://push.example.test/existing', p256dh: 'test-public-key', auth: 'test-auth' };
  const context = vm.createContext({
    URL,
    FRONTEND_BASE_URL: frontendUrl,
    VAPID_CONFIGURED: true,
    ensurePushTable: async () => {},
    getPool: () => ({
      execute: async (sql, params) => {
        queries.push({ sql, params });
        return [[subscription]];
      },
    }),
    webpush: {
      sendNotification: async (sub, payload) => {
        sent.push({ subscription: JSON.parse(JSON.stringify(sub)), payload: JSON.parse(payload) });
      },
    },
    console,
  });
  vm.runInContext(sendPushSource, context);
  await context.sendPushToUser('user-test', 'bip39', {
    title: 'Movix', body: 'Une nouvelle réponse', icon: '/movix.png', data,
  });
  assert.equal(sent.length, 1);
  return { ...sent[0], queries };
}

function worker(windowClients = []) {
  const handlers = new Map();
  const shown = [];
  const opened = [];
  const clients = {
    matchAll: async () => windowClients,
    openWindow: async (url) => { opened.push(url); return null; },
  };
  vm.runInNewContext(workerSource, {
    URL,
    clients,
    __MOVIX_DEFAULT_MIRRORS__: [],
    __MOVIX_CONFIG_URL__: 'https://config.example.test/mirrors',
    self: {
      location: new URL(OLD_ORIGIN),
      clients,
      addEventListener: (type, handler) => handlers.set(type, handler),
      registration: {
        showNotification: async (title, options) => shown.push({ title, ...options }),
      },
    },
  });
  return {
    shown,
    opened,
    async push(payload) {
      let pending;
      handlers.get('push')({ data: { json: () => payload }, waitUntil: (promise) => { pending = promise; } });
      await pending;
    },
    async click(data) {
      let pending;
      let closed = false;
      handlers.get('notificationclick')({
        notification: { data, close: () => { closed = true; } },
        waitUntil: (promise) => { pending = promise; },
      });
      await pending;
      assert.equal(closed, true);
    },
  };
}

test('le domaine du titre et du lien change sans remplacer un abonnement existant', async () => {
  const previous = await sendPush(OLD_ORIGIN);
  const current = await sendPush(`${NEW_ORIGIN}/ignored-path?source=config`);
  assert.equal(current.payload.title, 'Movix · movix-new.test');
  assert.equal(current.payload.data.url, `${NEW_ORIGIN}/movie/1212763`);
  assert.equal(current.payload.icon, `${NEW_ORIGIN}/movix.png`);
  assert.equal(current.payload.badge, `${NEW_ORIGIN}/movix.png`);
  assert.deepEqual(current.subscription, previous.subscription);
  assert.ok(current.queries.every(({ sql }) => sql.startsWith('SELECT ')));
});

test('les séries, les identifiants et la destination sans contenu sont préservés', async () => {
  assert.equal((await sendPush(NEW_ORIGIN, { contentType: 'tv', contentId: '42?x=1' })).payload.data.url,
    `${NEW_ORIGIN}/tv/42%3Fx%3D1`);
  assert.equal((await sendPush(NEW_ORIGIN, {})).payload.data.url, `${NEW_ORIGIN}/`);
});

test('une configuration invalide conserve la notification historique', async () => {
  for (const origin of [undefined, '', 'invalid', 'javascript:alert(1)', 'https://user:password@example.test']) {
    const { payload } = await sendPush(origin);
    assert.equal(payload.title, 'Movix');
    assert.equal(payload.icon, '/movix.png');
    assert.equal(payload.data.url, undefined);
  }
});

test('un service worker de l’ancien domaine affiche le titre et les icônes du domaine courant', async () => {
  const { payload } = await sendPush(NEW_ORIGIN);
  const sw = worker();
  await sw.push(payload);
  assert.equal(sw.shown[0].title, 'Movix · movix-new.test');
  assert.equal(sw.shown[0].icon, `${NEW_ORIGIN}/movix.png`);
  assert.equal(sw.shown[0].badge, `${NEW_ORIGIN}/movix.png`);
  await sw.click(sw.shown[0].data);
  assert.deepEqual(sw.opened, [`${NEW_ORIGIN}/movie/1212763`]);
});

test('un onglet existant est redirigé sans ouvrir de doublon après une navigation cross-origin', async () => {
  const actions = [];
  const sw = worker([{
    url: `${OLD_ORIGIN}/profile`,
    focus: async () => actions.push('focus'),
    navigate: async (url) => { actions.push(url); return null; },
  }]);
  await sw.click({ url: `${NEW_ORIGIN}/movie/42` });
  assert.deepEqual(actions, ['focus', `${NEW_ORIGIN}/movie/42`]);
  assert.deepEqual(sw.opened, []);
});

test('une navigation refusée ouvre la destination dans une nouvelle fenêtre', async () => {
  const sw = worker([{
    url: OLD_ORIGIN,
    focus: async () => {},
    navigate: async () => { throw new Error('Window closed'); },
  }]);
  await sw.click({ url: `${NEW_ORIGIN}/tv/42` });
  assert.deepEqual(sw.opened, [`${NEW_ORIGIN}/tv/42`]);
});

test('une autre origine qui cite l’ancien domaine dans son URL n’est pas réutilisée', async () => {
  const actions = [];
  const sw = worker([{
    url: `https://unrelated.test/?next=${OLD_ORIGIN}`,
    focus: async () => actions.push('focus'),
    navigate: async () => actions.push('navigate'),
  }]);
  await sw.click({ url: `${NEW_ORIGIN}/` });
  assert.deepEqual(actions, []);
  assert.deepEqual(sw.opened, [`${NEW_ORIGIN}/`]);
});

test('les anciennes notifications et les URL invalides reviennent au lien local du contenu', async () => {
  for (const url of [undefined, 'http://[', 'javascript:alert(1)', 'https://user:password@example.test']) {
    const sw = worker();
    await sw.click({ url, contentType: 'movie', contentId: 42 });
    assert.deepEqual(sw.opened, [`${OLD_ORIGIN}/movie/42`]);
  }
});
