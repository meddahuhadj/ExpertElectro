# HADJ EXPERT ÉLECTRO

Assistant intelligent de diagnostic, analyse et maintenance électrique / électronique / bâtiment / industrie. Application web statique installable (PWA), aucun serveur backend requis.

## Contenu

- `index.html` — l'application complète (une seule page, HTML+CSS+JS auto-contenus)
- `manifest.json` — manifeste PWA (nom, icônes, couleurs, mode d'affichage)
- `sw.js` — Service Worker (cache l'app shell pour un chargement hors-ligne fiable)
- `icons/` — icônes PWA (192, 512, maskable, apple-touch-icon)
- `render.yaml` — Blueprint de déploiement Render (Static Site)

## Clé API

L'application appelle l'API Gemini directement depuis le navigateur. Chaque
utilisateur saisit sa propre clé API (obtenue sur [Google AI Studio](https://aistudio.google.com/apikey)) ;
elle est stockée uniquement dans le `localStorage` de son navigateur, jamais
envoyée ailleurs qu'à l'API Google. Aucune clé n'est présente dans ce dépôt.

## Déployer sur Render

### Option A — Blueprint (recommandé)

1. Poussez ce dossier sur un dépôt GitHub (voir plus bas).
2. Sur [render.com](https://dashboard.render.com), **New +** → **Blueprint**.
3. Sélectionnez le dépôt. Render détecte `render.yaml` et configure tout automatiquement.
4. **Apply** — le site est en ligne en quelques dizaines de secondes, en HTTPS.

### Option B — Manuel

1. **New +** → **Static Site**.
2. Sélectionnez le dépôt GitHub.
3. Build Command : *(laisser vide)*
4. Publish Directory : `.` (racine du dépôt, ou `site` si ce dossier est un sous-dossier d'un dépôt plus large)
5. **Create Static Site**.

Une fois en ligne, HTTPS est automatique — le Service Worker et l'installation
en PWA (icône sur l'écran d'accueil, mode hors-ligne) ne fonctionnent qu'en
HTTPS ou en localhost, jamais en `file://`.

## Pousser sur GitHub

```bash
cd site
git init                                   # déjà fait si vous suivez ce README après coup
git add -A
git commit -m "HADJ EXPERT ÉLECTRO — PWA"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git push -u origin main
```

Créez d'abord le dépôt vide sur [github.com/new](https://github.com/new) (sans
README/licence pré-générés, pour éviter un conflit avec le premier push).

## Tester en local avant de déployer

Le Service Worker ne s'active pas en ouvrant simplement le fichier
(`file://…`) — il faut un vrai serveur, même local :

```bash
cd site
python -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Mettre à jour après un premier déploiement

```bash
git add -A
git commit -m "Description du changement"
git push
```

Avec `autoDeploy: true` dans `render.yaml`, Render redéploie automatiquement
à chaque push sur la branche connectée.
