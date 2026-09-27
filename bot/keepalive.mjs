#!/usr/bin/env node
/**
 * KeepAlive — garde un site (Render gratuit) éveillé en le pingant à intervalle
 * régulier et poste le statut dans Discord via un webhook, façon petit bot.
 *
 * Zéro dépendance : Node 18+ suffit.
 *
 * Lancement :
 *   KEEPALIVE_URL="https://ton-service.onrender.com" \
 *   DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/xxx" \
 *   node bot/keepalive.mjs
 *
 * Options (variables d'environnement) :
 *   KEEPALIVE_URL        (requis) adresse du site, sans / final
 *   DISCORD_WEBHOOK_URL  (optionnel) webhook Discord pour les messages de statut
 *   INTERVAL_MIN         (défaut 10) intervalle entre deux pings, en minutes
 *   NOTIFY_ALL           (défaut false) notifier à chaque ping ; sinon :
 *                        message au démarrage, aux changements d'état et sur panne
 *   QUIET                (défaut false) réduire les logs console
 *
 * Mode test (un seul ping puis sortie) :
 *   KEEPALIVE_URL="https://ton-service.onrender.com" node bot/keepalive.mjs --once
 */

const SITE_URL = (process.env.KEEPALIVE_URL || "").trim().replace(/\/+$/, "");
const WEBHOOK = (process.env.DISCORD_WEBHOOK_URL || "").trim();
const INTERVAL_MIN = Math.max(
  1,
  Number.parseInt(process.env.INTERVAL_MIN || "10", 10) || 10
);
const NOTIFY_ALL = (process.env.NOTIFY_ALL || "").toLowerCase() === "true";
const QUIET = (process.env.QUIET || "").toLowerCase() === "true";
const ONCE = process.argv.includes("--once");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!SITE_URL) {
  console.error("Erreur : KEEPALIVE_URL est requis.");
  console.error(
    'Exemple : KEEPALIVE_URL="https://ton-service.onrender.com" node bot/keepalive.mjs'
  );
  process.exit(1);
}

if (
  WEBHOOK &&
  !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(WEBHOOK)
) {
  console.error(
    "Attention : DISCORD_WEBHOOK_URL n'est pas une URL Discord standard ; tentative d'utilisation quand même."
  );
}

const PING_URL = `${SITE_URL}/api/health`;
const PING_TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 20_000;

let prevState = null; // null = premier ping, sinon true / false

function log(message) {
  if (!QUIET) console.log(`[${new Date().toISOString()}] ${message}`);
}

async function pingOnce() {
  const startedAt = Date.now();
  try {
    const res = await fetch(PING_URL, {
      headers: { "user-agent": "keepalive-bot/1.0 (DimalaxYT/bgh)" },
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      cache: "no-store",
    });
    await res.arrayBuffer().catch(() => {}); // libère la socket
    return { up: res.ok, status: res.status, ms: Date.now() - startedAt };
  } catch {
    return { up: false, status: 0, ms: Date.now() - startedAt };
  }
}

async function pingWithRetry() {
  const first = await pingOnce();
  if (first.up) return first;
  log(
    `Premier essai échoué (HTTP ${first.status || "sans réponse"}), nouvel essai dans 20 s (démarrage à froid possible)...`
  );
  await sleep(RETRY_DELAY_MS);
  return pingOnce();
}

function buildPayload(up, status, ms, change) {
  return {
    username: "KeepAlive",
    embeds: [
      {
        title: up ? "Site en ligne" : "Site injoignable",
        description: PING_URL,
        color: up ? 3066993 : 15158332, // vert / rouge
        fields: [
          {
            name: "HTTP",
            value: status ? String(status) : "aucune réponse",
            inline: true,
          },
          { name: "Latence", value: `${ms} ms`, inline: true },
          ...(change
            ? [{ name: "Changement détecté", value: "oui", inline: true }]
            : []),
        ],
        footer: { text: `Ping automatique toutes les ${INTERVAL_MIN} min` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function postToDiscord(payload) {
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Le webhook Discord a refusé le message (HTTP ${res.status}).`);
    }
  } catch (err) {
    console.error(`Webhook Discord injoignable : ${err?.message || err}`);
  }
}

async function tick() {
  const result = await pingWithRetry();
  const change = prevState !== null && prevState !== result.up;
  const firstRun = prevState === null;
  prevState = result.up;

  log(
    result.up
      ? `EN LIGNE - HTTP ${result.status} - ${result.ms} ms`
      : `HORS LIGNE - HTTP ${result.status || "?"} - ${result.ms} ms`
  );

  const shouldNotify = NOTIFY_ALL || !result.up || change || firstRun;
  if (WEBHOOK && shouldNotify) {
    await postToDiscord(buildPayload(result.up, result.status, result.ms, change));
  }
}

log(
  `KeepAlive démarré sur ${PING_URL} (toutes les ${INTERVAL_MIN} min)${
    WEBHOOK ? "" : " - pas de webhook Discord configuré"
  }`
);

await tick();

if (ONCE) {
  process.exit(0);
}

setInterval(tick, INTERVAL_MIN * 60_000);
