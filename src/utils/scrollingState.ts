// État de scroll partagé entre les carousels Embla.
//
// Chaque carousel signale son propre cycle scroll/settle via beginEmblaScroll/
// endEmblaScroll. Un compteur global maintient la classe `body.embla-scrolling`
// tant qu'au moins UN carousel est en mouvement. Cette classe sert de gate CSS
// pour `pointer-events: none` sur les slides — empêche les hover flips quand
// les cards défilent sous le curseur (chaque flip déclenchait un Layerize+Paint).
//
// Le clear est immédiat dès que tous les carousels ont fire leur event 'settle'
// (vélocité retombée à 0) → l'utilisateur peut hover instantanément à la fin
// du scroll, sans timer d'idle.
//
// Note : on n'utilise PAS la classe `body.is-scrolling` qui est gérée par
// SmoothScroll.tsx avec son propre timer pour le scroll vertical (wheel/touch/
// keydown). Les deux classes sont indépendantes — la règle CSS dans index.css
// matche les deux.

let activeEmblaCount = 0;

export const beginEmblaScroll = (): void => {
  if (typeof document === 'undefined') return;
  activeEmblaCount += 1;
  if (activeEmblaCount === 1) {
    document.body?.classList.add('embla-scrolling');
  }
};

export const endEmblaScroll = (): void => {
  if (typeof document === 'undefined') return;
  if (activeEmblaCount === 0) return;
  activeEmblaCount -= 1;
  if (activeEmblaCount === 0) {
    document.body?.classList.remove('embla-scrolling');
  }
};
