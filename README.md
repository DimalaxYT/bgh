# bgh pusher

Pont entre les IA et GitHub : colle du code, dépose des fichiers (ou un .zip entier), clique sur un bouton — tout est commité et poussé automatiquement sur le dépôt GitHub.

## Pourquoi

Les IA en mode chat ne peuvent pas pousser de code sur GitHub. Ce site sert de passerelle : n'importe quelle session IA peut produire du code, et l'utilisateur le pousse ici en un clic, avec un historique de commits propre.

## Fonctionnement

1. **Coller du texte** : nom de fichier + contenu (ex : `app/page.js`)
2. **Déposer des fichiers** : glisser-déposer multiple, `.zip` extracté automatiquement côté serveur
3. **Bouton « Pousser vers GitHub »** : un seul commit propre contenant tous les fichiers (API Git Data : blobs → tree → commit → mise à jour de la branche)
4. **Gérer le dépôt** : vue de tous les fichiers présents, avec recherche — modifier (éditeur intégré) ou supprimer (commit de suppression) en un clic
5. **Paramètres** : changer de token / dépôt / branche depuis l'interface — le token est validé auprès de GitHub avant enregistrement (stocké en mémoire serveur, jamais renvoyé en clair ; bouton « Retour à l'env » pour revenir à la variable d'environnement)
6. **Historique en direct** : les derniers commits du dépôt s'affichent à droite

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui
- API GitHub (Git Data) côté serveur uniquement

## Configuration

Variables d'environnement (voir `.env.example`) :

| Variable | Description | Défaut |
|---|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT avec permission `Contents: Read and write` sur le dépôt cible | — (requis) |
| `GITHUB_REPO` | Dépôt cible au format `propriétaire/nom` | `DimalaxYT/bgh` |
| `GITHUB_BRANCH` | Branche cible | `main` |

⚠️ Le token ne vit **jamais** dans le code ni côté navigateur : uniquement en variable d'environnement du serveur (sur Render : Dashboard → Environment).

## Déploiement sur Render

- Runtime : Node
- Build : `npm install && npm run build`
- Start : `npm start`
- Health check : `/api/health`

## Anti-sommeil Render (keep-alive)

Le plan gratuit de Render endort le service après 15 minutes sans visite (prochaine
visite = démarrage à froid de 30 à 60 s). Le dépôt inclut un ping automatique toutes
les 10 minutes, avec deux façons de le faire tourner.

### Option recommandée : GitHub Actions (aucun PC requis)

Le workflow `.github/workflows/keep-alive.yml` ping `/api/health` toutes les
10 minutes depuis les serveurs de GitHub. Configuration après le déploiement Render :

1. Sur GitHub : **Settings → Secrets and variables → Actions**
   - Onglet **Variables** → `RENDER_URL` = `https://TON-SERVICE.onrender.com` (requis)
   - Onglet **Secrets** → `DISCORD_WEBHOOK_URL` = URL d'un webhook Discord (optionnel,
     pour les messages de statut dans un salon)
   - Variable optionnelle `NOTIFY_ALL` = `true` pour un message à chaque ping
     (par défaut : démarrage, changements d'état et pannes uniquement)
2. Test manuel : onglet **Actions → Keep-alive Render → Run workflow**.

À savoir :

- Dépôt **public** = Actions gratuites à ce rythme ; en privé, ce rythme dépasse
  les 2 000 minutes/mois du plan gratuit.
- Le cron GitHub est « best effort » (parfois décalé de quelques minutes en heure
  de pointe). Pour une marge maximale, passer le cron à `*/5` ou ajouter un
  moniteur externe (cron-job.org, UptimeRobot).
- Les workflows planifiés d'un dépôt public sont désactivés après 60 jours sans
  commit : un commit occasionnel les réactive.

### Option : le petit bot en local (`bot/`)

`bot/keepalive.mjs` (zéro dépendance, Node 18+) ping le site et poste le statut
dans Discord via webhook — instructions complètes dans `bot/README.md` :

```bash
KEEPALIVE_URL="https://TON-SERVICE.onrender.com" \
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/xxx" \
node bot/keepalive.mjs
```

## Sécurité

- Chemins de fichiers assainis (remontées `../` et `.git/` interdites)
- Limites : 25 Mo par lot, 300 fichiers max
- Aucun secret dans les logs ni dans le client
