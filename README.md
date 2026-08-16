# HADJ EXPERT ÉLECTRO

Assistant intelligent de diagnostic, analyse et maintenance électrique / électronique / bâtiment / industrie. Application web statique installable (PWA), aucun serveur backend requis.

## Contenu

- `index.html` — l'application complète (une seule page, HTML+CSS+JS auto-contenus)
- `manifest.json` — manifeste PWA (nom, icônes, couleurs, mode d'affichage)
- `sw.js` — Service Worker (cache l'app shell pour un chargement hors-ligne fiable)
- `icons/` — icônes PWA (192, 512, maskable, apple-touch-icon)
- `render.yaml` — Blueprint de déploiement Render (Static Site)
- `vercel.json` — configuration Vercel (en-têtes de cache pour `sw.js`/`manifest.json`)

## Clé API

L'application appelle l'API Gemini directement depuis le navigateur. Chaque
utilisateur saisit sa propre clé API (obtenue sur [Google AI Studio](https://aistudio.google.com/apikey)) ;
elle est stockée uniquement dans le `localStorage` de son navigateur, jamais
envoyée ailleurs qu'à l'API Google. Aucune clé n'est présente dans ce dépôt.

## Déployer sur Vercel (recommandé)

1. Poussez ce dossier sur un dépôt GitHub (voir plus bas) — déjà fait pour
   `meddahuhadj/ExpertElectro`.
2. Sur [vercel.com/new](https://vercel.com/new), connectez votre compte GitHub
   si ce n'est pas déjà fait, puis **Import** sur le dépôt `ExpertElectro`.
3. Vercel détecte un site statique (aucun framework) : laissez les réglages
   par défaut — *Build Command* et *Output Directory* vides/racine.
4. **Deploy**. En ligne en HTTPS en moins d'une minute, à une URL du type
   `https://expert-electro.vercel.app`.
5. `vercel.json` définit déjà les en-têtes de cache nécessaires pour que les
   mises à jour de `sw.js`/`manifest.json` soient prises en compte rapidement.

Chaque `git push` sur `main` redéploie automatiquement.

## Déployer sur Render (alternative)

### Option A — Blueprint

1. Sur [render.com](https://dashboard.render.com), **New +** → **Blueprint**.
2. Sélectionnez le dépôt. Render détecte `render.yaml` et configure tout automatiquement.
3. **Apply** — le site est en ligne en quelques dizaines de secondes, en HTTPS.

### Option B — Manuel

1. **New +** → **Static Site**.
2. Sélectionnez le dépôt GitHub.
3. Build Command : *(laisser vide)*
4. Publish Directory : `.` (racine du dépôt, ou `site` si ce dossier est un sous-dossier d'un dépôt plus large)
5. **Create Static Site**.

Sur les deux plateformes, HTTPS est automatique — le Service Worker et
l'installation en PWA (icône sur l'écran d'accueil, mode hors-ligne) ne
fonctionnent qu'en HTTPS ou en localhost, jamais en `file://`.

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

(Si Python n'est pas disponible : `npx serve .` fait la même chose avec Node.)

## Mettre à jour après un premier déploiement

```bash
git add -A
git commit -m "Description du changement"
git push
```

Avec `autoDeploy: true` dans `render.yaml`, Render redéploie automatiquement
à chaque push sur la branche connectée.
