/*
   Retours des utilisateurs — « Signaler un problème ».

   Principes : rien n'est collecté à l'insu de l'utilisateur (le contenu exact
   du rapport lui est montré avant envoi, côté navigateur), aucune donnée
   n'est demandée au-delà de ce qu'il écrit, l'adresse IP n'est conservée que
   hachée et seulement pour limiter les abus, et tout expire au bout de six
   mois.
*/

const MAX_MESSAGE = 4000;
const MAX_CONTEXTE = 2000;
const RETENTION_S = 180 * 24 * 3600;
const PAR_HEURE = 5;

const hacher = async (v) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`permavore:${v}`));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
};

const refus = (code, statut = 400) => Response.json({ erreur: code }, { status: statut });

export async function onRequestPost({ request, env }) {
  const origine = request.headers.get("Origin") || "";
  if (origine && !/^https:\/\/([a-z0-9-]+\.)?permavore\.pages\.dev$/.test(origine)
      && !origine.startsWith("http://localhost")) {
    return refus("origine_refusee", 403);
  }
  if (!env.RETOURS) return refus("stockage_indisponible", 503);

  let corps;
  try { corps = await request.json(); } catch { return refus("json_invalide"); }

  const message = String(corps?.message ?? "").trim();
  if (message.length < 5) return refus("message_trop_court");
  if (message.length > MAX_MESSAGE) return refus("message_trop_long");

  const contact = String(corps?.contact ?? "").trim().slice(0, 200);
  const contexte = JSON.stringify(corps?.contexte ?? {}).slice(0, MAX_CONTEXTE);

  // Limitation d'abus : après validation, pour ne pas consommer le quota sur
  // des requêtes malformées.
  const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
  const empreinte = await hacher(ip);
  const cleDebit = `debit:${empreinte}:${new Date().toISOString().slice(0, 13)}`;
  const compte = Number(await env.RETOURS.get(cleDebit)) || 0;
  if (compte >= PAR_HEURE) return refus("trop_de_retours", 429);
  await env.RETOURS.put(cleDebit, String(compte + 1), { expirationTtl: 3600 });

  const id = `retour:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  await env.RETOURS.put(id, JSON.stringify({
    recu: new Date().toISOString(),
    message, contact: contact || null, contexte: JSON.parse(contexte || "{}"),
    pays: request.headers.get("CF-IPCountry") || null,
    auteur: empreinte,        // haché : distingue deux auteurs, n'identifie personne
  }), { expirationTtl: RETENTION_S });

  return Response.json({ ok: true, id });
}
