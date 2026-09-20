/**
 * force-graph stocke la position de départ sur le nœud, pas par doigt.
 * Deux touchstart sur le même nœud partagent donc __initialDragPos : le
 * premier touchend l'efface et le second plante. Pendant un drag de nœud,
 * laisser un seul doigt entrer dans d3-drag. Un pincement commencé sur le
 * fond reste disponible pour zoomer.
 */
export const bindSingleNodeTouchDrag = (
  canvas: HTMLCanvasElement,
  hitsNode: (clientX: number, clientY: number) => boolean,
): (() => void) => {
  let nodeDrag = false;
  const onStart = (event: TouchEvent) => {
    // Un geste commencé sur le fond peut atteindre un nœud avec le doigt
    // suivant : réévaluer chaque touchstart avant de le transmettre à d3.
    nodeDrag ||= Array.from(event.touches).some(touch => hitsNode(touch.clientX, touch.clientY));
    if (nodeDrag && event.touches.length > 1) event.stopImmediatePropagation();
  };
  const onEnd = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      nodeDrag = false;
    }
  };
  canvas.addEventListener('touchstart', onStart, { capture: true, passive: true });
  canvas.addEventListener('touchend', onEnd, { capture: true, passive: true });
  canvas.addEventListener('touchcancel', onEnd, { capture: true, passive: true });
  return () => {
    canvas.removeEventListener('touchstart', onStart, true);
    canvas.removeEventListener('touchend', onEnd, true);
    canvas.removeEventListener('touchcancel', onEnd, true);
  };
};
