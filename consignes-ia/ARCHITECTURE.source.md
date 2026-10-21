# Architecture du dépôt

Ce dépôt regroupe de petits exemples autonomes de steering behaviors avec p5.js. Chaque dossier numéroté correspond à un exemple ou à sa correction. Les consignes de développement complètes sont dans [`AGENTS.md`](AGENTS.md).

## Frontières du code

### `vehicle.js` : code fourni et protégé

Les fichiers `vehicle.js` fournissent le modèle de véhicule utilisé par les exemples : état (position, vitesse, accélération), paramètres de vitesse et de force, comportements déjà disponibles, application des forces, locomotion et dessin.

**Ne pas modifier un fichier `vehicle.js` sans demander d'abord l'accord explicite de l'utilisateur.** Ce code a été fourni et doit en principe rester inchangé. Ne pas dupliquer ses comportements ni remplacer sa logique interne.

Pour étendre un exemple, créer une sous-classe distincte de `Vehicle` pour chaque entité identifiée (par exemple joueur, ennemi ou véhicule spécialisé). La sous-classe peut réutiliser les méthodes existantes et ajouter des comportements. Elle doit produire des forces avec la loi `steering = vitesseDésirée - vitesseActuelle`, respecter `maxForce`, puis utiliser `applyForce`; la mise à jour de la locomotion reste celle du véhicule de base.

### Classes d'entité

Créer un fichier séparé par type d'entité, dans le dossier de l'exemple concerné : par exemple `Player.js`, `Enemy.js` et `Target.js`. Ne pas regrouper plusieurs types d'entités dans un fichier. Toute entité visible, même si elle paraît statique, étend `Vehicle`; ne pas créer de classe d'objet visible indépendante de `Vehicle`.

### Comportements et composition

Garder chaque comportement indépendant, réutilisable et testable. Les entités ou le code de l'exemple combinent les forces avec une somme pondérée ou une règle de priorité. Distinguer l'objectif choisi, le calcul des forces de steering et l'application des forces par la locomotion.

## Tests

Chaque nouvelle fonctionnalité d'un exemple doit être accompagnée de tests unitaires pertinents, exécutés avant de présenter la modification comme terminée. Consulter [`AGENTS.md`](AGENTS.md) pour les attentes de couverture, la reproductibilité de l'aléatoire et la communication du résultat des tests.

## Scénarios de 1-Seek

`SeekScenarios` conserve deux collections parallèles de cibles normales et fuyantes. Le passage d'un scénario à l'autre réinitialise les états de fuite, sans recréer les véhicules. Toutes les cibles du scénario actif sont mises à jour ; `SeekPopulation.nearestTarget()` choisit ensuite la cible la plus proche de chaque véhicule.

`Target extends Vehicle` porte l'animation normale : direction aléatoire pilotée par `seek()`, changement de taille et de couleur selon une horloge locale. `TargetFutante extends Target`, dans `targetFutante.js`, ajoute la perception et les états normal/fuite/épuisement. La fuite utilise `super.flee()`, les forces passent par `applyForce()` et l'intégration héritée n'est exécutée qu'une fois par image. `SeekVehicle extends Vehicle` spécialise seulement l'affichage du vecteur de vitesse selon le debug.

Les rayons de déclenchement et de sortie sont distincts. Le plus proche des prédateurs est recherché pendant la fuite même au-delà du cercle de détection ; la durée borne l'épisode et l'épuisement impose un retour en sécurité avant réarmement. L'endurance et la couleur de perception sont des lectures de cet état.

Toutes les entités graphiques du monde, mobiles ou momentanément immobiles, héritent de Vehicle. Les commandes HTML, le dégradé et les indicateurs restent du rendu. Les téléportations de réapparition sont des règles explicites de scène, distinctes du steering. Aucun fichier `vehicle.js` n'est modifié par cette évolution.
Le scénario possède maintenant deux collections parallèles de cibles (`normalTargets` et `fleeingTargets`). `SeekPopulation.nearestTarget()` choisit la cible la plus proche d'un véhicule avant l'appel à `seek`; la logique de scène ne duplique pas le calcul de steering. Le curseur de cibles conserve les instances existantes autant que possible et crée les nouvelles cibles avec la même classe que leur collection.

`SeekEffectsAudio` centralise les effets synthétiques. Il reçoit le contexte de `PsychedelicAudio`, génère ses buffers avec WebAudioX/jsfx, puis suit les transitions d'état des cibles. Les sources de fuite sont indexées par instance de cible afin de permettre plusieurs fuites simultanées ; le cooldown d'alarme est également indexé par instance.
