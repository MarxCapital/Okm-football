# OKM Football Académie — site officiel et espace d'administration

Site public (maquette « Familles ») + espace d'administration sécurisé, pour **GitHub + Cloudflare Pages**.

- **Site public** : HTML, CSS et JavaScript sans framework, sans étape de build.
- **API** : Cloudflare **Pages Functions** (`functions/` et `server/`).
- **Données** : base **Cloudflare D1** (SQLite). **Images** : **Cloudflare R2**.
- **Administration** (`/okm`) : c'est elle qui alimente tout le site public. Rien n'est écrit en dur dans les pages.

```
Administration (/okm)  ──►  API (/api/admin/*)  ──►  D1 + R2
                                                          │
Visiteurs (site public)  ◄──  API (/api/news, /api/matches…)  (champs publics seulement)
```

## Structure

```
public/                       dossier publié par Cloudflare Pages
  *.html                      pages publiques (accueil, équipes, joueurs, matchs, …)
  okm/index.html              espace d'administration (adresse /okm)
  okm/js/schema.js          ★ SCHÉMA UNIQUE : champs, rôles, menus (utilisé par l'admin ET par le serveur)
  admin/js/*.js               interface d'administration
  assets/                     CSS, JavaScript du site public, images
  data/*.json                 données d'exemple, utilisées seulement si apiBase = "" (mode démonstration)
  _headers                    en-têtes de sécurité (CSP, etc.)
functions/api/[[route]].js    point d'entrée de l'API (/api/*)
server/                       code de l'API : routes, authentification, validation, règles de publication
migrations/                   tables D1 (0001 : base, 0002 : vidéos)
seed/                         données de démonstration (textes, matchs, joueurs fictifs…)
public/demo/                  photos, logos et vidéos de démonstration (remplaçables depuis l'admin)
tests/                        tests automatisés (npm test)
scripts/                      serveur local sans outil Cloudflare, contrôles statiques
wrangler.toml                 liaisons Cloudflare (D1, R2)
```

## Mise en ligne, pas à pas

Prérequis : un compte Cloudflare, Node 22.13 ou plus récent sur votre ordinateur.

**1. GitHub.** Créez un dépôt, puis `git init`, `git add .`, `git commit -m "Site OKM"`, `git remote add origin …`, `git push -u origin main`.

**2. Créer la base et le stockage d'images** (une seule fois, depuis le dossier du projet) :

```bash
npm install --save-dev wrangler      # outil Cloudflare
npx wrangler login
npx wrangler d1 create okm-db        # affiche un "database_id"
npx wrangler r2 bucket create okm-media
```

Copiez le `database_id` dans `wrangler.toml` (à la place de `REMPLACER-PAR-LE-DATABASE-ID`), puis faites un `git commit` et un `git push`.

**3. Créer les tables :**

```bash
npm run db:migrate:remote
```

**3 bis. (Facultatif) Charger les données de démonstration** pour voir le site rempli tout de suite :

```bash
npm run db:seed:remote
```

Voir la section « Données de démonstration » plus bas.

**4. Créer le projet Pages.** Cloudflare → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → choisissez le dépôt. Framework : *None*. Commande de build : *(vide)*. Dossier de sortie : `public`. Les liaisons D1 et R2 viennent de `wrangler.toml`.

**5. Supabase (authentification de l'administration).** Le site utilise votre projet Supabase pour vérifier l'identité de l'administrateur. Les mots de passe restent chez Supabase : ils ne sont jamais dans le code ni dans GitHub.

1. Dans Supabase → *Authentication* → *Users* → *Add user* → *Create new user* : saisissez l'adresse e-mail de l'administrateur et son mot de passe, et cochez **Auto Confirm User**.
2. Dans Supabase → *Authentication* → *Sign In / Providers* → désactivez **Allow new users to sign up** : sinon n'importe qui peut ouvrir un compte Supabase (il n'aurait pas accès à l'administration, mais autant le fermer).
3. Dans `wrangler.toml`, renseignez `ADMIN_EMAIL` avec cette même adresse e-mail, puis faites un `git commit` et un `git push`. À sa première connexion, ce compte devient « Administrateur général ». Toute autre adresse Supabase est refusée tant qu'elle n'a pas été ajoutée dans le menu *Comptes*.
4. Les variables `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` sont déjà dans `wrangler.toml` (la clé « publishable » est publique par conception).

Secrets facultatifs, dans le projet Pages → *Settings* → *Variables and Secrets* (type *Secret*) :

| Nom | Rôle |
|---|---|
| `SUPABASE_SERVICE_KEY` | Clé « secret » Supabase (jamais dans Git). Permet de créer des comptes et de réinitialiser un mot de passe depuis le menu *Comptes*. Sans elle, créez le compte dans Supabase, puis autorisez-le dans *Comptes* (sans mot de passe). |
| `TURNSTILE_SECRET` | Clé secrète Cloudflare Turnstile (anti-robots des formulaires). |

Relancez un déploiement pour que les secrets soient pris en compte.

**6. Se connecter.** L'espace d'administration est à l'adresse `https://okmfootball.digitsolution.org/okm` : saisissez l'e-mail et le mot de passe créés dans Supabase. Cette adresse n'apparaît dans aucun menu, dans `robots.txt` ni dans le plan du site, et les moteurs de recherche ne l'indexent pas ; elle n'est cependant pas secrète à elle seule : la protection, c'est le mot de passe (verrouillage de 15 minutes après 5 échecs).

> **Choisissez un mot de passe solide.** Cet espace donne accès aux demandes d'inscription et aux coordonnées des familles d'enfants mineurs. Un mot de passe court construit sur le nom du club et l'année se devine facilement. Utilisez au moins 12 caractères (le menu *Mon compte* l'exige lors d'un changement). Pour aller plus loin : activez l'authentification à deux facteurs sur votre compte Supabase et GitHub, et protégez `/okm*` avec Cloudflare Access.

**7. Domaine.** *Custom domains* : ajoutez `okmfootball.digitsolution.org` au projet Pages. Le domaine et les comptes (Cloudflare, GitHub, Supabase) doivent appartenir à l'académie ou être sous son contrôle direct.

**8. Remplir le site.** Dans l'administration : Catégories → Équipes → Joueurs et Autorisations → Matchs → Actualités → Partenaires → Contenus du site. Aucun contenu n'apparaît sur le site avant d'avoir été créé **et** publié.

À faire aussi : remplacer le logo provisoire `public/assets/img/logo.svg`, faire relire `public/mentions-legales.html`.

## Les trois rôles

L'administrateur général a accès à tout. Les autres rôles voient uniquement leur menu, et le **serveur** refuse tout le reste (masquer un menu ne suffit pas).

| Section | Administrateur | Communication | Sport |
|---|:-:|:-:|:-:|
| Actualités, Galerie, Vidéos, Partenaires, Contenus du site | ✔ | ✔ | |
| Messages reçus (formulaire de contact) | ✔ | ✔ | |
| Catégories, Équipes, Compétitions, Matchs, Trophées | ✔ | | ✔ |
| Joueurs, Autorisations, Inscriptions | ✔ | | ✔ |
| Comptes utilisateurs, Journal des actions | ✔ | | |

Pour modifier ces droits : champ `roles` de chaque section dans `public/okm/js/schema.js`. Les inscriptions (données d'enfants) sont réservées au rôle Sport : c'est un choix de prudence, pas une obligation du cahier des charges.

## Quand un contenu devient-il public ?

| Contenu | Visible sur le site si… |
|---|---|
| Actualité | statut « Publié » **et** date de publication atteinte (date future = publication programmée) |
| Joueur | « Publier le profil » coché, statut sportif « Actif », **et** une autorisation « profil » non révoquée enregistrée |
| Photo d'un joueur | en plus, une autorisation « photo » non révoquée |
| Match | pas terminé, ou terminé **et validé** (un résultat non validé reste invisible et hors bilan) |
| Équipe | toujours (les équipes archivées apparaissent dans l'onglet Archives) ; nom de l'entraîneur seulement si « Publier » est coché |
| Partenaire | « Présentation approuvée » cochée ; période seulement si « Publier la période » est coché |
| Album | « Publier cet album » coché |
| Vidéo | « Publier cette vidéo » coché ; « Mettre à la une » la place sur la page d'accueil |

Un joueur s'affiche sous la forme « Jean K. » par défaut. Révoquer une autorisation retire le profil ou la photo du site immédiatement (au plus 60 secondes, durée du cache).

**Inscriptions.** Une demande arrive avec le statut « Nouvelle » et n'est **jamais** une admission automatique. Le responsable la passe en « En cours », « Acceptée » ou « Refusée ». Pour une demande acceptée, un bouton crée la fiche joueur (non publiée).

**Messages.** Un message passe en « Lu » à l'ouverture.

## Données personnelles

- Les champs privés (téléphone du responsable, notes internes, nom complet, année de naissance, numéro interne) ne sont **jamais** renvoyés par l'API publique : chaque collection publique a une liste blanche de champs (`server/public.js`).
- Supprimer un joueur supprime aussi ses autorisations. Supprimer une inscription ou un message se fait depuis sa fiche (droit à l'effacement). Un compte ne se supprime pas, il se désactive.
- Le journal des actions (administrateur uniquement) ne contient **aucun** nom de joueur, de candidat ou d'expéditeur.
- Durée de conservation : à définir par l'académie et à écrire dans `mentions-legales.html`.

## Sécurité mise en place

- Mots de passe : vérifiés par Supabase Auth (jamais stockés ici). Sans Supabase configuré (essais en local), le site retombe sur un mode local : PBKDF2-SHA256 salé, 12 caractères minimum.
- Sessions : jeton aléatoire dans un cookie `HttpOnly`, `Secure`, `SameSite=Strict`, durée 12 h ; seule l'empreinte du jeton est en base. Changer de mot de passe ou désactiver un compte coupe ses sessions.
- Verrouillage : 5 échecs de connexion pour une même adresse e-mail depuis une même connexion → blocage de 15 minutes.
- CSRF : cookie `SameSite=Strict` + en-tête obligatoire + contrôle de l'origine sur chaque écriture.
- Contrôle des droits côté serveur sur chaque requête ; validation de chaque champ côté serveur.
- Formulaires publics : limite de 5 envois par heure et par visiteur, champ piège anti-robots, Turnstile (facultatif).
- Images : le format réel est vérifié (JPEG, PNG, WebP), 3 Mo maximum, réduites dans le navigateur avant l'envoi.
- Pas d'injection : requêtes SQL paramétrées, contenu affiché en texte (jamais en HTML), CSP stricte sans script ni style en ligne.
- Journal des opérations importantes (création, modification, suppression, connexions, comptes).
- Il doit toujours rester un administrateur actif ; on ne peut pas se retirer ses propres droits.

## Sauvegardes (à mettre en place)

Le cahier des charges demande des sauvegardes hors de l'hébergement principal. Ce n'est **pas automatique** ici :

- **D1** conserve un historique restaurable (*Time Travel*, 30 jours). Cela reste chez Cloudflare.
- Exportez régulièrement la base : `npx wrangler d1 export okm-db --remote --output sauvegarde.sql`, et gardez le fichier **ailleurs** (disque, autre cloud). Les exports contiennent des données personnelles : protégez-les.
- Les **images** de R2 ne sont pas sauvegardées automatiquement.

## Développer et tester

```bash
npm test              # 29 tests automatisés de l'API (Node 22.13+, aucune installation)
npm run check         # JSON valides, liens, pas de style en ligne
npm run dev:local     # site + admin + API sur http://localhost:8788, base SQLite locale (.dev/)
npm run dev:demo      # idem, avec les données de démonstration chargées dans une base neuve
npm run dev           # simulation Cloudflare complète (après "npm install --save-dev wrangler" et "npm run db:migrate:local")
```

Avec `dev:local`, l'authentification Supabase est désactivée (mode local hors ligne) : le jeton d'installation est `jeton-local-0123456789`. Ce serveur n'est destiné qu'au développement.

**Ajouter ou modifier un champ** : éditez `public/okm/js/schema.js`. Le champ apparaît dans le formulaire d'administration et est validé par le serveur. S'il doit aussi être public, ajoutez-le dans la liste blanche de `server/public.js` et affichez-le dans `public/assets/js/ui.js`.

## Données de démonstration

Pour que le site ne soit pas vide au départ, le projet contient des **contenus fictifs** : 4 catégories (U11 à U17), 5 équipes, 8 joueurs avec autorisations, 8 matchs (3 à venir, 5 terminés), 6 actualités dont un brouillon, 3 albums de photos, 2 vidéos, 3 trophées, 5 partenaires et les textes de la page d'accueil. Les photos et vidéos sont des **illustrations générées** (aucune vraie personne) rangées dans `public/demo/`.

- **Les charger** : `npm run db:seed:remote` (ou `db:seed:local`). Les dates sont calculées à partir du jour du lancement. Les lignes ont toutes un identifiant qui commence par `demo-`.
- **Les modifier** : tout se fait dans l'administration, comme pour vos propres contenus (texte, photo, vidéo, publication). Pour changer une photo : « Envoyer une image ». Pour changer la photo de la page d'accueil : *Contenus du site*.
- **Les retirer** : `npm run db:unseed:remote` supprime uniquement les lignes `demo-…`. Vos contenus et les réglages du site sont conservés. Les fichiers de `public/demo/` peuvent ensuite être supprimés du dépôt.
- **Les vidéos** : dans *Vidéos*, envoyez un fichier MP4 ou WebM (20 Mo maximum) ou collez un lien YouTube ou une adresse https:// vers un fichier vidéo.
- Pensez à retirer la démonstration avant d'annoncer le site : elle contient des textes fictifs (« exemple »).

## Ce qui n'a pas pu être vérifié

- Les vidéos de démonstration sont en MP4 (H.264), lisible par tous les navigateurs courants ; le Chromium de mes tests ne lit pas H.264, j'ai donc contrôlé la lecture avec une vidéo WebM envoyée par l'administration.
- Les polices (Bricolage Grotesque, DM Sans) viennent de Google Fonts : mon environnement n'y a pas accès, les captures ont été faites avec des polices de remplacement.
- Les tests ont tourné sur une base SQLite locale qui imite D1, et sur un faux R2. **Je n'ai pas pu installer l'outil Cloudflare (`wrangler`) dans mon environnement : le code n'a donc jamais tourné sur le vrai Cloudflare.** Le premier déploiement est le vrai test : suivez les étapes ci-dessus et vérifiez l'installation, la connexion, l'envoi d'une image et l'inscription.
- **Temps de calcul à la connexion.** Le hachage PBKDF2 (100 000 itérations, le maximum de Cloudflare) peut dépasser la limite de temps de l'offre gratuite. Si la connexion échoue avec une erreur de dépassement (« exceeded CPU »), ajoutez la variable `PBKDF2_ITERATIONS` (par exemple `50000`) pour les nouveaux mots de passe, ou passez à l'offre Workers payante. Les mots de passe déjà créés restent valables.
- **Supabase** : l'intégration a été testée avec une simulation de l'API Supabase (29 tests), pas avec votre vrai projet : mon environnement n'a pas accès à supabase.co. Le premier essai réel est la connexion à `/okm` après déploiement. Si elle échoue avec « service indisponible », vérifiez `SUPABASE_URL` et la clé ; avec « compte non autorisé », vérifiez `ADMIN_EMAIL`.
- **E-mails de notification** : non implémentés. Une nouvelle inscription ou un nouveau message apparaît dans le tableau de bord et dans les pastilles du menu.
- **Classement de compétition** : la page Matchs affiche un bilan de l'académie, pas un classement complet.
- Le test dans un navigateur (parcours complet admin → site public, mobile et ordinateur, avec la CSP de production) a été fait avec Chromium ; Safari et Firefox ne sont pas testés.

## Mode démonstration (sans backend)

Dans `public/assets/js/config.js`, mettez `apiBase: ""` : le site lit alors `public/data/*.json` (contenus d'exemple) et les formulaires n'enregistrent rien. L'administration ne fonctionne pas dans ce mode.
