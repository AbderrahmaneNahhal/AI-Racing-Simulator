# Assets méditerranéens — provenance et prompts

Créés le 20 octobre 2026 avec l'outil intégré **imagegen** (skill imagegen), à partir de descriptions. La référence utilisateur « Tableau de bord IA Racing méditerranéen.png » guide la direction artistique ; son image entière et sa route ne sont pas intégrées au canvas. Aucun téléchargement de banque d'images, aucune police ni bibliothèque graphique supplémentaire. Pas d'asset tiers déclaré sous une licence inventée : ces trois images sont des sorties générées, pas des photographies documentaires de Nice.

Les PNG locaux sont nécessaires au rendu enrichi. `racingArt.js` les précharge avec p5, découpe les atlas une fois, conserve l'alpha des sprites et prépare des motifs réfléchis pour raccorder les matériaux. Les teintes GT3 sont mises en cache en cinq variantes ; Race conserve huit variantes numérotées. Le rendu vectoriel antérieur sert de secours si une image échoue ; l'erreur est signalée dans la console.

## mediterranean-materials-v1.png

Prompt exact :

> Production texture atlas for a realistic aerial 2D Mediterranean racing game. A square image divided into EXACTLY four equal square quadrants touching edge to edge, no gutters, no text or labels, no roads, no vehicles or trees. TOP LEFT: uniform dark charcoal race track asphalt, fine photographic mineral aggregate and subtle wear, neutral dark gray, no lane lines, no cracks. TOP RIGHT: natural Mediterranean ground aerial orthographic photograph, patchy short olive green grass mixed with dry pale tan earth, fine ground-level details, no objects. BOTTOM LEFT: pale sandy limestone gravel with sparse dried grass fine photographic texture. BOTTOM RIGHT: deep turquoise Mediterranean water with small sunlight glints, clear aerial water surface only no shoreline or rocks. Each quadrant should individually tile seamlessly without visible border, no giant motifs, fine detailed true material texture, evenly lit warm midday sun. 2048 square or high resolution. Realistic raster material assets, not flat vector illustration, not a rendered circuit scene.

## mediterranean-scenery-v1.png

Prompt exact :

> Transparent RGBA production sprite atlas for a photorealistic 2D top down Mediterranean racing game. EXACT 3 columns by 2 rows in a square canvas, each of SIX cells equal width and height. No grid lines, no text, no labels. ONE isolated subject centered per cell, generous transparent padding, no content crossing cells. Strict vertical aerial orthographic camera, no horizon, realistic detailed photographic textures, warm sunlight from UPPER LEFT and short soft shadows to lower right contained inside each cell. Top row left umbrella pine tree round irregular canopy viewed from directly above with many detailed green needles; top row middle olive tree silver green dense foliage and visible branches; top row right elegant palm canopy star fronds. Bottom row left dense Mediterranean scrub bush low foliage; bottom row middle cluster pale weathered limestone rocks with cracks; bottom row right small rectangular Mediterranean paddock building with terracotta tiled gabled roof viewed exactly overhead, realistic individual tiles and gutters, axis horizontal. The atlas must have truly transparent background between isolated assets, no ground planes, no green squares, no checkerboard baked in. Each subject takes about 70 percent cell width and height; shadows within that margin. Crisp professional game assets, no cartoon outline, no vector style, no isometric camera.

## gt3-overhead-v1.png

Prompt exact :

> One professional photorealistic GT3 racing car sprite, directly TOP DOWN perfectly orthographic overhead, FRONT NOSE POINTS TO THE RIGHT (+X), REAR WING ON THE LEFT. True transparent RGBA background. Single whole vehicle centered horizontal in wide landscape canvas, car spans 82 percent of width and about 60 percent height including mirrors, generous transparent margins, no ground and no cast shadow (game adds shadow separately). Body long about 2.2 times width, credible racing proportions. Beautiful bright metallic royal BLUE body paint with white narrow motorsport accent stripes, dark carbon front splitter and wide REAR WING on LEFT, visible dark slick tires, crisp hood vents, clear front windshield on RIGHT side of cabin, tinted rear engine window LEFT of cabin, side windows, subtle specular body highlights, head lights at RIGHT nose and red tail lights at LEFT, small racing mirrors. No text, no watermark, no brand or logos or numbers, unobstructed roof for game number. Premium photographic 3D rendered detail but completely vertical overhead camera, no isometric perspective, no tilt, no background scene, isolated game asset. Warm light upper left. Do not draw a front or rear perspective view.

## Intégration et limites

- Matériaux : asphalte, sol herbe/terre sèche, gravier calcaire, eau. Le motif d'asphalte est réduit à 128 unités et assombri, sans changer le masque exact de chaussée.
- Nature : pin parasol, olivier, palmier, arbuste, calcaire et toit de paddock. Découpe et limites de chaque empreinte testées ; objets peints dans le cache, jamais de nouveaux obstacles physiques.
- GT3 : sprite RGBA, nez vers +X, carrosserie 10,8 × 5,6 unités dans le tampon 12,8 × 8 existant. Rotation par la direction existante, aucune orientation physique réécrite.
- Échelle et éclairage sont adaptés au jeu ; le résultat est un rendu 2D texturé inspiré de l'aérien, pas une reconstruction photogrammétrique de la Côte d'Azur. La route polygonale reste volontairement celle des collisions.
- Aucun alpha, poids neuronal ou état d'une voiture n'est modifié par le préchargement. Les seules allocations de textures/sprites ont lieu au premier usage ; le décor est composé lors de la création du circuit, puis affiché par une image.

