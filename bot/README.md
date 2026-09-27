# KeepAlive — le petit bot anti-sommeil

Ping le site toutes les 10 minutes (le plan gratuit de Render endort le service
après 15 minutes sans visite) et poste le statut dans Discord via un webhook.

Zéro dépendance : Node 18+ suffit, rien à installer.

## 1. Créer le webhook Discord (2 minutes)

1. Dans ton serveur Discord : paramètres du salon → **Intégrations** → **Webhooks** → **Nouveau webhook** (ou : paramètres du serveur → Intégrations → Webhooks → Créer).
2. Choisis un nom (ex. `KeepAlive`) et le salon cible, puis **Copier l'URL du webhook**.
3. Garde cette URL secrète : quiconque la possède peut écrire dans le salon.

## 2. Lancer le bot

Linux / macOS / Git Bash :

```bash
KEEPALIVE_URL="https://TON-SERVICE.onrender.com" \
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/xxx" \
node bot/keepalive.mjs
```

Windows PowerShell :

```powershell
$env:KEEPALIVE_URL = "https://TON-SERVICE.onrender.com"
$env:DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/xxx"
node bot/keepalive.mjs
```

Test rapide (un seul ping puis sortie) : ajouter `--once` à la commande.

## 3. Options

| Variable | Défaut | Rôle |
|---|---|---|
| `KEEPALIVE_URL` | — (requis) | Adresse du site Render, sans `/` final |
| `DISCORD_WEBHOOK_URL` | — | Webhook Discord pour les messages de statut |
| `INTERVAL_MIN` | `10` | Intervalle entre deux pings, en minutes |
| `NOTIFY_ALL` | `false` | `true` = un message à chaque ping ; sinon : démarrage, changements d'état et pannes uniquement |
| `QUIET` | `false` | `true` = logs console réduits |

## 4. Où le faire tourner ?

Le bot doit rester allumé pour pouvoir pinger : ton PC (tant qu'il ne dort pas),
un Raspberry Pi, un VPS...

Pour une solution sans aucune machine, préfère le **workflow GitHub Actions**
inclus dans le dépôt (`.github/workflows/keep-alive.yml`) : il ping le site
toutes les 10 minutes depuis les serveurs de GitHub, gratuitement pour un
dépôt public. Voir la section « Anti-sommeil Render » du README principal.
