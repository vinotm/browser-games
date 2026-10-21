// Enhance a native select while preserving its value and change events.
import { createPopupMotion } from './animation.js';

export function enhanceSelect(select) {
  const wrap = select.parentElement;
  const label = document.querySelector(`label[for="${select.id}"]`);
  const trigger = document.createElement('button');
  const value = document.createElement('span');
  const list = document.createElement('div');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.id = `${select.id}-trigger`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  value.id = `${select.id}-value`;
  if (label) {
    label.id ||= `${select.id}-label`;
    label.htmlFor = trigger.id;
    trigger.setAttribute('aria-labelledby', `${label.id} ${value.id}`);
  }
  trigger.append(value);
  list.id = `${select.id}-options`;
  list.className = 'select-options';
  list.setAttribute('role', 'listbox');
  if (label) list.setAttribute('aria-labelledby', label.id);
  list.hidden = true;
  const motion = createPopupMotion(list, { offset: () => list.dataset.placement === 'above' ? 6 : -6 });
  trigger.setAttribute('aria-controls', list.id);
  const options = [...select.options].map((option, index) => {
    const item = document.createElement('div');
    item.id = `${select.id}-option-${index}`;
    item.className = 'select-option';
    item.setAttribute('role', 'option');
    item.textContent = option.textContent;
    item.addEventListener('click', () => choose(index));
    list.append(item);
    return item;
  });
  let active = select.selectedIndex;
  function position() {
    const viewport = window.visualViewport;
    let top = viewport?.offsetTop ?? 0;
    let bottom = top + (viewport?.height ?? window.innerHeight);
    // Respect every clipping ancestor, not just the browser window.
    for (let parent = wrap.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
      const rect = parent.getBoundingClientRect();
      top = Math.max(top, rect.top + parent.clientTop);
      bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
    }
    const rect = wrap.getBoundingClientRect(), gap = 5, inset = 4;
    const above = Math.max(0, rect.top - top - gap - inset);
    const below = Math.max(0, bottom - rect.bottom - gap - inset);
    // A collapsed measurement avoids expanding the ancestor's scrollable area.
    const previousVisibility = list.style.visibility, wasHidden = list.hidden;
    list.style.visibility = 'hidden'; list.hidden = false; list.style.maxHeight = '0px';
    const height = list.scrollHeight;
    const upward = height > below && above > below;
    list.dataset.placement = upward ? 'above' : 'below';
    list.style.top = upward ? 'auto' : `calc(100% + ${gap}px)`;
    list.style.bottom = upward ? `calc(100% + ${gap}px)` : 'auto';
    list.style.maxHeight = `${upward ? above : below}px`;
    list.hidden = wasHidden;
    list.style.visibility = previousVisibility;
  }
  function revealActive() {
    const option = options[active];
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }
  function sync() {
    value.textContent = select.selectedOptions[0].textContent;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === select.selectedIndex)));
  }
  function highlight(index) {
    active = index;
    options.forEach((option, i) => option.classList.toggle('is-active', i === active));
    trigger.setAttribute('aria-activedescendant', options[active].id);
    revealActive();
  }
  function close() {
    if (!motion.isOpen()) return;
    wrap.classList.add('is-closing');
    void motion.hide().then(hidden => { if (hidden) wrap.classList.remove('is-closing'); });
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    wrap.classList.remove('is-open');
  }
  function open() {
    trigger.focus({ preventScroll: true });
    wrap.classList.remove('is-closing');
    position();
    void motion.show();
    trigger.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-open');
    highlight(select.selectedIndex);
  }
  function choose(index) {
    select.selectedIndex = index;
    sync(); close(); trigger.focus({ preventScroll: true });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  trigger.addEventListener('click', () => motion.isOpen() ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const key = event.key;
    if (key === 'Tab') { close(); return; }
    if (key === 'Escape') {
      if (motion.isOpen()) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (!motion.isOpen()) open();
      else highlight(key === 'Home' ? 0 : key === 'End' ? options.length - 1 : (active + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if ((key === 'Enter' || key === ' ') && motion.isOpen()) {
      event.preventDefault(); choose(active);
    } else if (key.length === 1 && /\S/.test(key)) {
      const index = options.findIndex((_, offset) => select.options[(active + offset + 1) % options.length].textContent.toLowerCase().startsWith(key.toLowerCase()));
      if (index >= 0) {
        event.preventDefault();
        if (!motion.isOpen()) open();
        highlight((active + index + 1) % options.length);
      }
    }
  });
  document.addEventListener('pointerdown', event => { if (!wrap.contains(event.target)) close(); });
  trigger.addEventListener('blur', close);
  // Keep focus on the combobox until an option has been selected.
  list.addEventListener('pointerdown', event => event.preventDefault());
  select.addEventListener('change', sync);
  select.addEventListener('optionschange', sync);
  const reposition = () => { if (motion.isOpen()) { position(); revealActive(); } };
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  document.addEventListener('scroll', event => { if (event.target !== list) reposition(); }, true);
  select.hidden = true;
  wrap.append(trigger, list);
  sync();
}
