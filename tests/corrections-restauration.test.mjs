import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as core from '../sauvegarde-core.mjs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const moduleClassique = name => source(name)
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, '')
  .replace(/^export /gm, '');
function memoire() {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k) };
}
function environnement(overrides = {}) {
  const ctx = vm.createContext({ ...core, localStorage: memoire(),
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {} },
    window: { addEventListener() {} }, CustomEvent: class {},
    setTimeout, clearTimeout, console,
    Secours: { initialiser() {}, jardinModifie() {} },
    lireLocalStorage() { return core.etatDepuisBrut(Object.fromEntries(core.clesMetier()
      .map(k => [k, ctx.localStorage.getItem(k)]).filter(([, v]) => v !== null))); },
    appliquerVersLocalStorage(etat) { Object.entries(etat.donnees).forEach(([k, v]) => ctx.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v))); },
    ecrireEtat: async () => {}, sauvegardeSecurite: async () => 'filet',
    restaurerSauvegarde: async () => {}, sauvegardes() {}, journal() {},
    synchroniserCopieDurable: async () => {},
    initialiserStockage: async () => ({ ok: true }),
    lireSachets: async () => [], ecrireSachets: async () => 0,
    ...overrides });
  vm.runInContext(moduleClassique('sauvegarde.js'), ctx);
  return ctx;
}
const photo = { id: 'photo-test', plantId: 'radis', dataUrl: 'data:image/jpeg;base64,AAAA' };
const fichier = photos => core.construireExport(core.etatDepuisBrut({
  'permavore.jardin.v1': JSON.stringify({ ville: 'Jardin test', surface: 40 }),
}), { sachets: photos });

for (const [nom, ecrire, lire] of [
  ['écriture refusée', async () => 0, async () => []],
  ['écriture rejetée', async () => { throw new Error('quota'); }, async () => []],
  ['photo absente à la relecture', async () => 1, async () => []],
  ['photo corrompue avec le même identifiant', async () => 1, async () => [{ ...photo, dataUrl: 'incorrect' }]],
]) test('restauration incomplète : ' + nom, async () => {
  const ctx = environnement({ ecrireSachets: ecrire, lireSachets: lire });
  ctx.localStorage.setItem('permavore.restauration.v1', '{"verifie":true}');
  const r = await ctx.restaurerJardin(fichier([photo]), async () => true);
  assert.equal(r.ok, false);
  assert.equal(r.etape, 'photos');
  assert.equal(r.incomplet, true);
  assert.equal(ctx.localStorage.getItem('permavore.restauration.v1'), null);
  assert.equal(JSON.parse(ctx.localStorage.getItem('permavore.jardin.v1')).surface, 40);
});

test('le reçu compte les photos relues identiques, même avec un ordre de clés différent', async () => {
  const ctx = environnement({ ecrireSachets: async () => 1,
    lireSachets: async () => [{ dataUrl: photo.dataUrl, plantId: photo.plantId, id: photo.id }, { id: 'autre' }] });
  const r = await ctx.restaurerJardin(fichier([photo]), async () => true);
  assert.equal(r.ok, true);
  assert.equal(r.recu.verifie, true);
  assert.equal(r.recu.photos, 1);
});

test('une sauvegarde sans photos reste restaurable', async () => {
  const r = await environnement().restaurerJardin(fichier([]), async () => true);
  assert.equal(r.ok, true);
  assert.equal(r.recu.photos, 0);
});

test('deux appels au démarrage partagent une seule récupération', async () => {
  let appels = 0;
  let terminer;
  const ctx = environnement({ initialiserStockage: () => {
    appels++;
    return new Promise(resolve => { terminer = resolve; });
  } });
  const a = ctx.demarrerSauvegarde();
  const b = ctx.demarrerSauvegarde();
  assert.equal(a, b);
  assert.equal(appels, 1);
  terminer({ ok: true, source: 'indexeddb', restaure: true });
  assert.equal((await a).restaure, true);
});

test('le démarrage attend la récupération puis recharge tous les modèles avant l’interface', async () => {
  let terminer;
  const ordre = [];
  const ctx = vm.createContext({
    chargerModule: async () => ({ demarrerSauvegarde: () => new Promise(r => { terminer = r; }) }),
    document: { dispatchEvent() {} }, CustomEvent: class {},
    chargerInstances() { ordre.push('instances'); }, chargerZones() { ordre.push('zones'); },
    chargerOccupations() { ordre.push('occupations'); }, chargerExperiences() { ordre.push('experiences'); },
    traduireStatique() { ordre.push('interface'); throw new Error('fin du périmètre de test'); },
  });
  const app = source('app.js');
  const init = app.slice(app.indexOf('async function init() {'), app.indexOf('  construireSelecteurLangue();', app.indexOf('async function init() {')))
    .replace('import("./sauvegarde.js")', 'chargerModule()') + '\n}';
  vm.runInContext(init, ctx);
  const attente = ctx.init();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ordre, []);
  terminer({ ok: true, restaure: true });
  await assert.rejects(attente, /fin du périmètre/);
  assert.deepEqual(ordre, ['instances', 'zones', 'occupations', 'experiences', 'interface']);
});

test('Expérience Lune utilise les coordonnées lexicales sans window.state, y compris zéro', () => {
  const app = source('app.js'), ui = source('lune-ui.js');
  const lieux = [];
  const ctx = vm.createContext({ window: {}, E: () => ({ creerExperience: (_, lieu) => { lieux.push(lieu); return {}; } }),
    afficherExperience() {}, fermerPanneau() {}, panneau() {}, T: x => x });
  vm.runInContext('const state = { villeCoords: {lat: 0, lng: 0} };\n' +
    app.slice(app.indexOf('function coordonneesJardin()'), app.indexOf('function zoneCourante()')), ctx);
  ctx.window.coordonneesJardin = ctx.coordonneesJardin;
  vm.runInContext(ui.slice(ui.indexOf('function demarrer()'), ui.indexOf('/* ---------- suivi')), ctx);
  ctx.demarrer();
  assert.equal(lieux.length, 1);
  assert.equal(lieux[0].lat, 0);
  assert.equal(lieux[0].lng, 0);
  vm.runInContext('state.villeCoords = null', ctx);
  ctx.demarrer();
  assert.equal(lieux.length, 1);
});
