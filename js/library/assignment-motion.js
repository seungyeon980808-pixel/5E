// Classification is committed immediately. Motion only explains the departure,
// arrival and remaining cards' reflow; it never delays or queues the user's work.
export function createAssignmentMotion(overlay) {
  const animations = new Set(), ghosts = new Set();
  const layer = document.createElement('div');
  layer.className = 'workbench-assignment-motion-layer'; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
  overlay.querySelector('.workbench-assignment').append(layer);
  const clear = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
  };
  const play = (node, frames, options, done = () => {}) => {
    if (!node.animate) { done(); return; }
    const animation = node.animate(frames, {easing:'cubic-bezier(.16,1,.3,1)', ...options});
    animations.add(animation);
    animation.finished.then(() => { animations.delete(animation); done(); }, () => { animations.delete(animation); done(); });
  };
  return {
    clear,
    capture(indices, destination) {
      clear();
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const moving = new Set(indices.map(String));
      const before = new Map([...overlay.querySelectorAll('[data-reference]')].map(node => [node.dataset.reference, {node, rect:node.getBoundingClientRect()}]));
      const parent = layer.getBoundingClientRect(), scale = parent.width / layer.offsetWidth || 1;
      return () => {
        for (const node of overlay.querySelectorAll('[data-reference]')) {
          const old = before.get(node.dataset.reference); if (!old) continue;
          const rect = node.getBoundingClientRect();
          if (moving.has(node.dataset.reference)) {
            const direction = Math.sign(rect.left - old.rect.left) || (destination === 'pending' ? -1 : 1);
            const ghost = old.node.cloneNode(true);
            for (const child of [ghost,...ghost.querySelectorAll('*')]) {
              for (const attr of [...child.attributes]) if (attr.name.startsWith('data-') || attr.name === 'id') child.removeAttribute(attr.name);
            }
            ghost.classList.add('workbench-assignment-motion-ghost'); ghost.inert = true; ghost.draggable = false;
            ghost.setAttribute('aria-hidden', 'true');
            Object.assign(ghost.style, {left:`${(old.rect.left-parent.left)/scale}px`,top:`${(old.rect.top-parent.top)/scale}px`,width:`${old.rect.width/scale}px`,height:`${old.rect.height/scale}px`});
            layer.append(ghost); ghosts.add(ghost);
            play(ghost, [{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${reduced?0:direction*14}px)`}], {duration:reduced?80:130,fill:'forwards'}, () => {ghost.remove();ghosts.delete(ghost);});
            play(node, [{opacity:0,transform:`translateX(${reduced?0:-direction*12}px)`},{opacity:1,transform:'translateX(0)'}], {duration:reduced?100:220,delay:reduced?0:70,fill:'backwards'});
          } else if (!reduced) {
            const dx=(old.rect.left-rect.left)/scale, dy=(old.rect.top-rect.top)/scale;
            if (Math.abs(dx)+Math.abs(dy)>1) play(node,[{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:220});
          }
        }
      };
    },
  };
}
