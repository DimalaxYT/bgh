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

## Sécurité

- Chemins de fichiers assainis (remontées `../` et `.git/` interdites)
- Limites : 25 Mo par lot, 300 fichiers max
- Aucun secret dans les logs ni dans le client
