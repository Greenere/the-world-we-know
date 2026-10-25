type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

/** Tiny hyperscript: h('div.card', {onclick}, 'text', child). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | Child, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  const [base, id] = name.split('#');
  const el = document.createElement(base as K);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs as Child);
  } else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * Set an element's icon markup only when it changes. UI that updates every frame during playback must not
 * rebuild a button's contents: a click whose press and release land on different nodes never fires.
 */
export function setIcon(el: HTMLElement, html: string) {
  if (el.dataset.icon === html) return;
  el.dataset.icon = html;
  el.innerHTML = html;
}

export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
