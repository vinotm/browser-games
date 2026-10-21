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
  const motion = createPopupMotion(list);
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
  function sync() {
    value.textContent = select.selectedOptions[0].textContent;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === select.selectedIndex)));
  }
  function highlight(index) {
    active = index;
    options.forEach((option, i) => option.classList.toggle('is-active', i === active));
    trigger.setAttribute('aria-activedescendant', options[active].id);
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
  select.hidden = true;
  wrap.append(trigger, list);
  sync();
}
