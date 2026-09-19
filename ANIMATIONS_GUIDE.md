# Animations Infinity Club

## Une horloge, des roles distincts

`App.jsx` monte un seul `AnimationProvider`, autour de toutes les routes.
Il initialise `useLenis()` et le curseur global. Les pages ne doivent pas
initialiser un autre Lenis, une autre boucle RAF ou un autre gestionnaire d'ancres.

- **GSAP + ScrollTrigger** : progression du scroll, textes, voiles, parallax et pin.
- **Framer Motion** : interactions, carrousel tactile, hover, accordions et lightbox.
- **SplitText** : plugin officiel inclus dans la version de GSAP du projet.
  Il remplace le besoin de SplitType et recalcule les lignes apres changement
  de largeur ou chargement des polices.

Lenis emet `scroll` vers `ScrollTrigger.update`. Son `raf` est appele par
`gsap.ticker` avec la conversion secondes -> millisecondes. Le scroll tactile
reste natif. Ne pas ajouter une inertie supplementaire sur chaque reveal.

## Composants prets a utiliser

```jsx
import AnimatedText from './components/AnimatedText'
import ScrollReveal from './components/ScrollReveal'

<AnimatedText tag="h2">Meet the Infiniters.</AnimatedText>

<AnimatedText tag="p" split="lines">
  Students learning, making and sharing their next step.
</AnimatedText>

<ScrollReveal mode="wipe" color="#002a1e">
  <img src="/assets/image.png" width="1741" height="907" alt="AIVEX preview" />
</ScrollReveal>
```

`AnimatedText` accepte `tag`, `split` (`words` ou `lines`), `start`, `end`,
`className` et les attributs HTML habituels. Reserver son contenu au texte,
aux sauts de ligne et aux accents typographiques statiques. Placer les liens,
controles et contenus interactifs dans des elements voisins. Le texte complet
reste accessible aux lecteurs d'ecran ; les fragments visuels ne sont pas lus
un par un. Un changement de message recree proprement son sous-arbre.

`ScrollReveal` accepte `tag`, `mode`, `color`, `start`, `end` et les attributs HTML.
Modes : `fade` (opacite et faible translation), `depth` (perspective de 5 degres),
`wipe` (voile vertical), `horizontal` (voile lateral). La couleur du voile doit
correspondre au fond qui entoure le visuel.

Le wipe utilise un element de recouvrement dont le **transform** change,
pas un `clip-path` ou un filtre anime. C'est le compromis retenu pour respecter
la contrainte transform/opacite, notamment sur les grandes images.

## Une scene sur mesure

```jsx
import { useRef } from 'react'
import useScrollAnimations from './hooks/useScrollAnimations'

function Workshop() {
  const sectionRef = useRef(null)
  useScrollAnimations(sectionRef, (animation) => {
    animation.revealText('.workshop-title')
    animation.revealText('.workshop-copy', { type: 'lines' })
    animation.revealSection('.workshop-photo', { mode: 'wipe' })
    animation.parallaxElement('.workshop-photo img', .18, {
      trigger: '.workshop-photo', axis: 'y',
    })
  })
  return (
    <section ref={sectionRef}>
      <h2 className="workshop-title">Build something together.</h2>
      <p className="workshop-copy">A question is a good place to start.</p>
      <div className="workshop-photo">
        <img src="/assets/image.png" width="1741" height="907" alt="AIVEX" />
      </div>
    </section>
  )
}
```

Les selecteurs sont limites au `scopeRef`. Chaque helper accepte aussi un
element DOM ou une ref React. Le hook gere `gsap.matchMedia`, le contexte GSAP,
le retour des styles et la suppression des voiles/decoupages au demontage.
Il fonctionne avec le double montage de React StrictMode.

Ne pas appliquer `AnimatedText` **et** `revealText` au meme titre. Ne pas
animer la meme propriete du meme element avec Framer et GSAP. Utiliser deux
wrappers distincts, comme `team-frame-reveal` et `team-frame-depth`.

### Parametres des helpers

| Helper | Options principales |
| --- | --- |
| `revealText(ref, options)` | `type`, `trigger`, `start`, `end`, `scrub`, `once`, `scroll: false`, `delay`, `drift: false` (mots seuls, la boîte du contrôle reste fixe) |
| `revealAllText()` | sans options : balaye `h1-h4` + `p, blockquote, figcaption, dt, dd` du scope, ignore le déjà-animé, les contrôles (`button`), les héros avec intro, la galerie, le notebook, les frames du carrousel et les régions Framer (accordéons, onglets). À appeler en dernier dans chaque `configure`. |
| `revealSection(ref, options)` | `mode` (`fade`, `depth`, `wipe`, `horizontal`, `draw` : trait SVG trace de gauche a droite), `color`, `trigger`, `start`, `end`, `stagger`, `once`, `delay` (mode viewport) |
| `parallaxElement(ref, speed, options)` | `axis: 'x' / 'y'`, `rotation`, `trigger`, `start`, `end` |
| `countUp(ref, target, options)` | `suffix`, `format`, `delay` |
| `pinSection(ref, duration, options)` | `pin`, `start`, `id` ; retourne une timeline ou `null` |

`speed` est une intensite relative a la hauteur du viewport, pas une promesse
de vitesse physique 0.5x. Une valeur negative inverse le mouvement.

La configuration globale se trouve dans `src/lib/animationSettings.js` :
stagger des mots `.08`, des lignes `.05`, duree texte `.72`, ease `power3.out`.
Avec `scrub: true`, la duree et le stagger repartissent le mouvement **dans la
distance de scroll**, ils n'ajoutent pas un delai chronometre au scroll.
Les revelations se rejouent a l'envers lorsque l'on remonte.

Les positions par defaut vont de `top 93%` a `top 58%`. On ne les borne pas
automatiquement a zero : les contenus deja presents au premier ecran doivent
etre visibles. Un titre deja passe dans sa zone de lecture est entierement affiche.
Pour le footer, `clamp(bottom bottom)` permet de terminer avant la fin du document.

### Mode viewport (page d'accueil)

Le scrub lie la lisibilite a la distance de scroll : un paragraphe n'etait
entierement lisible qu'arrive vers le milieu de l'ecran. La page d'accueil
utilise donc un autre declenchement, active par un attribut sur une region :

```jsx
<main data-motion-trigger="viewport">...</main>
```

Tout ce qui est anime dans cette region (`revealText`, `revealAllText`,
`revealSection`, `AnimatedText`, `ScrollReveal`, FAQ, poles) passe alors par
`src/lib/viewportPresence.js` (IntersectionObserver) :

- **Entree** : des qu'un bloc depasse de 6 % le bas de l'ecran, son animation
  joue sur une horloge (titres mot par mot, paragraphes ligne par ligne,
  environ une seconde). Plusieurs blocs entrant ensemble s'enchainent du haut vers le bas.
- **Sortie** : le bloc se masque seulement lorsqu'il est entierement hors
  champ (sous le header fixe ou sous le bas de l'ecran). L'ecart entre les deux
  seuils evite tout clignotement quand le pouce hesite sur un bord.
- **Retour** : en remontant, le texte redescend a sa place depuis le haut.
- Un bloc deja visible ne rejoue pas son entree lors d'une reconstruction
  (ouverture d'une question de la FAQ, changement d'onglet, redimensionnement).
- Les blocs `sticky` sont suivis sans cas particulier.

Dans ce mode, `start`, `end`, `scrub` et `drift` sont ignores ; `trigger`
reste utile pour faire entrer un groupe d'un bloc (ex. le trait sous le titre
Contact, declenche par le `h2`). Les reglages sont dans `VIEWPORT_MOTION`
(`src/lib/animationSettings.js`). Pour etendre ce comportement a une autre
page, ajouter l'attribut a sa region principale.

### Un pin, pas un obstacle

```jsx
useScrollAnimations(sectionRef, (animation) => {
  const scene = animation.pinSection(sectionRef, .68, { pin: '.scene-inner' })
  if (!scene) return // mobile, ecran court ou mouvement reduit
  scene.to('.scene-art', { scale: .94, y: -24, duration: 1 })
})
```

`duration` indique une fraction de viewport ajoutee au parcours. Le Hero Home
utilise `.68` et `scrub: 1` pour un rattrapage doux d'une seconde. Tous les
petits reveals utilisent un suivi direct. Le pin est autorise uniquement a
partir de 1024 px de largeur et 760 px de hauteur, avec un pointeur fin.
Le `pinSpacing` est conserve pour eviter les chevauchements.

Ne jamais supprimer les espacements du pin manuellement. Ne pas appliquer de
transform a un ancetre du conteneur fixe. Eviter les successions de pins :
le symbole Infinity est le moment fort, le reste accompagne la lecture.

### Compteurs

```jsx
import CountUp from './components/CountUp'

<CountUp value={memberCount} suffix="+" delay={.12} />
```

N'utiliser que des chiffres verifies. Le composant reserve la largeur finale,
compte une fois avec `expo.out` et expose uniquement le resultat aux lecteurs
d'ecran. Il ne relit pas la mise en page a chaque increment. Avec le helper
bas niveau, reserver soi-meme la largeur du conteneur de texte.

## Scenes integrees

- Home, About, Community, Events, Contact et AIVEX : presence viewport
  (attribut `data-motion-trigger="viewport"` sur le `<main>`) — titres mot
  par mot, paragraphes ligne par ligne, environ une seconde, rejoues en
  remontant.
  Home garde en plus son pin (logo en profondeur, visuel AIVEX devoile,
  mosaique a plusieurs vitesses, FAQ et sortie de page). Pôles : onglets,
  carte atelier et liens avec la chorégraphie AIVEX (display/reading, depth).
  Sur About, le signal qui parcourt les etapes du projet et les progressions
  d'etapes restent scrubbes ; sur Community, le parallax exterieur des cadres
  reste scrubbe et le carrousel 3D interieur garde son horloge Framer
  independante (navigation clavier et lightbox conservees) ; sur Contact, le
  trait du repertoire reste scrubbe.
- AIVEX : textes et cartes en presence viewport comme Home ; les intros
  collees (galerie, preparation) entrent une fois et tiennent (`once: true`).
  La galerie reste pilotee par ScrollTrigger. Les quickSetters GSAP mettent a
  jour images, miniatures et progression. La MotionValue partage la position
  avec les controles manuels ; elle n'ecoute plus le scroll via Framer.
  L'intro du hero, la barre de progression, le parallax du footer et la
  scene 3D gardent leurs horloges dediees.
- Navigation : fond transparent en haut, fond lisible apres 24 px. Barre de
  progression du document et curseur optionnel, sans retirer le pointeur natif.

## Ancres, images et nettoyage

`useLenis` gere les ancres et le transfert de focus. `RouteScrollReset`
annule aussi une destination Lenis en cours lors du changement de route.
Les images et polices declenchent un `requestScrollRefresh()` regroupe sur
100 ms. Un ResizeObserver du conteneur racine couvre les routes lazy et les
contenus dont la hauteur change. Les dimensions `width` et `height` des images
doivent toujours etre renseignees.

Un composant qui bloque le scroll (menu, lightbox, loader) emet une paire :

```js
window.dispatchEvent(new CustomEvent('infinity:scroll-lock', {
  detail: { locked: true },
}))
// Au nettoyage, emettre exactement une fois locked: false.
```

Le contexte compte les blocages imbriques. Ne pas appeler `start()` directement
depuis un modal. `useAnimationContext()` retourne la ref Lenis pour un
deplacement programme ; sa valeur peut etre `null` sur mobile.

## Accessibilite et verification

- Sous 768 px ou avec un pointeur tactile : pas de Lenis ni de pin, pas de
  curseur personnalise. La chorégraphie est identique au desktop partout
  (masques, tilts, depth, wipe, parallax, scène AIVEX, intro) : seul le layout
  reste responsive. Seul `prefers-reduced-motion` coupe les animations.
- `prefers-reduced-motion: reduce` : textes et images immediatement visibles,
  pas de split/pin/parallax, controles manuels conserves dans les galeries.
- Un controle recevant le focus reste visible meme pendant un reveal.
- Les animations GSAP sont annulees avec leur contexte ; les ecoutes, observers
  et souscriptions sont retires au demontage. Pas de `ScrollTrigger.killAll()`.

Avant de livrer une nouvelle scene : `npm run lint`, `npm run build`, puis
parcourir les routes dans les deux sens, tester le retour au sommet, un lien
`/#poles`, un refresh direct, le clavier, les modals, le swipe et un changement
de preference de mouvement. Revenir plusieurs fois sur une route : le nombre
de ScrollTriggers doit rester stable. Mesurer sur un vrai mobile avant toute
promesse de 60 fps sur tous les appareils.
