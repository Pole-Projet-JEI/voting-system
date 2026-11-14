# Solutions de sécurité appliquées

Ce document décrit les corrections appliquées aux deux problèmes critiques
restants du projet.

## 1. Chargement des variables `.env` au démarrage

### Problème

Les variables d'environnement pouvaient être lues avant le chargement du
fichier `server/.env`. Les secrets admin et JWT pouvaient donc être considérés
comme absents au démarrage.

### Solution

Le chargement de dotenv est exécuté avant les autres modules :

```js
import "dotenv/config";
```

Le serveur attend également la connexion à MongoDB avant de continuer :

```js
await dbconfig(mongoUri);
await seedVoters();
```

Cela garantit l'ordre suivant :

1. charger `server/.env` ;
2. vérifier les secrets ;
3. se connecter à MongoDB Atlas ;
4. initialiser les votants si nécessaire ;
5. démarrer le serveur HTTP.

Fichiers concernés :

- `server/src/index.mjs`
- `server/src/config/secrets.mjs`
- `server/src/mongodb/connect.mjs`

## 2. Protection des codes votants et des secrets

### Problème

Les 600 codes votants étaient présents directement dans le code source. Une
personne ayant accès au dépôt pouvait donc les récupérer. Les secrets
d'exemple étaient également trop prévisibles.

### Solution appliquée aux codes

- Les codes ne sont plus importés depuis `server/src/seed/codes.mjs`.
- Les codes actuels sont conservés dans le dossier privé
  `server/private/`.
- Le dossier `server/private/` est ignoré par Git.
- Le seed lit les codes uniquement si la collection `voters` est vide.
- Le seed vérifie que les codes sont uniques et respectent le format attendu.
- Les 600 votants déjà présents dans MongoDB sont conservés.

Fichiers concernés :

- `server/src/seed/seed-voters.mjs`
- `server/src/seed/codes.mjs` supprimé
- `server/.gitignore`
- `server/private/voter-codes.json` fichier local privé

Ne jamais publier ou committer le fichier `server/private/voter-codes.json`.

### Solution appliquée aux secrets

Les secrets de développement ont été renouvelés dans `server/.env` :

- `ADMIN_SECRET_KEY`
- `JWT_SECRET`
- `SESSION_SECRET`

Le fichier `server/.env` doit rester local et ne doit jamais être commité.
Utilisez la nouvelle valeur de `ADMIN_SECRET_KEY` pour vous connecter à
l'administration.

## Configuration nécessaire

Le fichier `server/.env` doit contenir au minimum :

```env
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/votingsystem?retryWrites=true&w=majority
SESSION_SECRET=une-valeur-secrete-longue
ADMIN_SECRET_KEY=une-valeur-secrete-longue
JWT_SECRET=une-valeur-secrete-longue
JWT_EXPIRY=24h
```

Les valeurs `USER`, `PASSWORD` et `CLUSTER` doivent être remplacées par les
valeurs de MongoDB Atlas.

## Démarrage en développement

Terminal backend :

```powershell
cd C:\Users\MSI\Downloads\vote\voting-system\server
npm run start:dev
```

Terminal frontend :

```powershell
cd C:\Users\MSI\Downloads\vote\voting-system\client
npm run dev
```

Le backend doit afficher :

```text
Connected to MongoDB
Database already contains 600 voters
Server is running on http://0.0.0.0:3000
```

## Vérifications effectuées

- Build frontend réussi avec `npm run build`.
- Tests backend réussis : 7 tests sur 7.
- Cookie forgé refusé.
- Connexion MongoDB Atlas réussie.
- Les 600 votants existants sont conservés.

## 3. Cookies, erreurs internes et HTTPS

### Problème

Les cookies de session doivent être protégés lorsqu'ils circulent sur HTTPS.
Les détails d'erreur internes ne doivent pas être envoyés au navigateur, car
ils peuvent révéler la structure de la base ou du serveur. En développement,
`localhost` reste cependant en HTTP.

### Solution

La fonction `server/src/config/cookies.mjs` active `Secure` en production et
en staging :

- développement HTTP : `secure: false`, nécessaire pour `localhost` ;
- staging/production HTTPS : `secure: true`.

Les cookies participant et admin utilisent maintenant cette règle commune.
Les erreurs détaillées restent dans les logs serveur, tandis que le client
reçoit un message générique.

Fichiers concernés :

- `server/src/config/cookies.mjs`
- `server/src/register/register.mjs`
- `server/src/admin/apis/auth/login.mjs`
- `server/src/admin/apis/auth/logout.mjs`
- `server/src/admin/apis/presenting.mjs`
- `server/src/admin/apis/team-management.mjs`
- `server/src/admin/apis/visualization.mjs`

En production, le domaine doit être servi en HTTPS avec un certificat valide,
et `client/.env` doit utiliser une URL `https://`.

### Résultat du problème 8

La vérification de la sécurité des cookies donne :

```text
development=false
staging=true
production=true
```

Les tests backend et le build frontend sont également réussis.

Pour le développement local actuel, conserver :

```env
NODE_ENV=development
```

et utiliser :

```text
http://localhost:5173
```

Le fichier `client/default.conf` n'est pas forcé en HTTPS, car le projet est
actuellement utilisé sans Docker en développement. En production, il faudra
configurer un certificat HTTPS sur le serveur Nginx et utiliser une URL
frontend commençant par `https://`.

## 4. Limitation des tentatives

### Problème

Les routes de connexion admin et d'inscription votant acceptaient un nombre
illimité de tentatives. Une clé admin ou un code votant pouvait donc être testé
automatiquement par brute force.

### Correction appliquée

Le middleware `server/src/middleware/rate-limiters.mjs` limite maintenant :

- les connexions admin à 3 tentatives par fenêtre de 15 minutes et par IP ;
- les inscriptions votants à 5 tentatives par fenêtre de 15 minutes et par IP.

Après dépassement, l'API renvoie HTTP `429` avec un message générique. Les
réponses ne révèlent pas si une clé ou un code précis existe et indiquent le
nombre de secondes avant le prochain essai.

Les interfaces admin et votant affichent ce délai sous forme de compte à
rebours et désactivent le bouton pendant la période de blocage.

Fichiers concernés :

- `server/src/middleware/rate-limiters.mjs`
- `server/src/register/register.mjs`
- `server/src/admin/apis/auth/login.mjs`
- `server/package.json`

Cette première étape conserve l'interface et les codes actuels. Pour plusieurs
instances backend en production, le stockage du rate limit devra être partagé
(par exemple avec Redis) au lieu de rester en mémoire dans un seul processus.

La deuxième étape prévue est une migration complète vers des comptes admin
individuels et des codes votants hashés en base.

## 5. Migration forte des identités

Les codes votants existants ont été migrés vers `codeHash` avec un HMAC
protégé par `VOTER_CODE_PEPPER`. La vérification Atlas a confirmé :

```text
total=600 missingCodeHash=0 legacyPlaintext=0
```

Le champ `code` en clair a été supprimé de la base. Les codes privés restent
uniquement dans `server/private/` pour pouvoir être distribués aux votants.

La connexion admin accepte maintenant un username et un mot de passe définis
dans `server/.env`. L'ancienne `ADMIN_SECRET_KEY` reste temporairement
acceptée comme secours pendant la transition.

Configuration simple pour le développement :

```powershell
ADMIN_USERNAME=admin
ADMIN_PASSWORD=un-mot-de-passe-long-et-aleatoire
```

Après cette configuration, utilisez le username et le mot de passe dans
l'écran admin. L'ancienne clé pourra être supprimée après vérification.
Pour la production, utilisez plutôt un hash ou un gestionnaire de secrets.

## 6. Affichage sécurisé des mots de passe

Les formulaires de connexion admin et de changement du mot de passe masquent
les mots de passe par défaut, tout en permettant à l'utilisateur de les
afficher temporairement avec une icône œil.

La solution comprend :

- un bouton indépendant pour afficher ou masquer chaque champ ;
- une icône `Eye` quand le mot de passe est masqué et `EyeOff` quand il est
  visible ;
- des libellés accessibles avec `aria-label` ;
- aucun changement dans le stockage ou le traitement des mots de passe ;
- des textes définitifs dans l'écran de connexion : `Username`, `Password` et
  `Enter your credentials to continue`.

Fichiers concernés :

- `client/src/pages/admin/AdminLoginPage.jsx`
- `client/src/pages/admin/AdminPage.jsx`

