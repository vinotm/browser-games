import { validDimensions } from './rules.js';

function restrictToDigits(input) {
  let previous = input.value, caret = previous.length;
  function remember() {
    if (/^[0-9]*$/.test(input.value)) { previous = input.value; caret = input.selectionStart ?? previous.length; }
  }
  input.addEventListener('focus', remember);
  input.addEventListener('beforeinput', event => {
    remember();
    if (event.inputType?.startsWith('insert') && event.data && /[^0-9]/.test(event.data) && event.cancelable) event.preventDefault();
  });
  input.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault();
  });
  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain');
    if (text && /[^0-9]/.test(text)) event.preventDefault();
  });
  // Some mobile keyboards and autofill cannot be cancelled before insertion.
  // Reject the whole invalid edit rather than turning "12x3" into another size.
  input.addEventListener('input', () => {
    if (/^[0-9]*$/.test(input.value)) remember();
    else { input.value = previous; input.setSelectionRange(caret, caret); }
  });
}

export function createBoardSettings(select, saved = {}) {
  let custom = validDimensions(saved.customRows, saved.customColumns)
    ? { rows: saved.customRows, columns: saved.customColumns } : { rows: 10, columns: 10 };
  let previous = select.value;
  const dialog = document.querySelector('#custom-size');
  const rows = document.querySelector('#custom-rows'), columns = document.querySelector('#custom-columns');
  const warning = document.querySelector('#custom-warning'), ok = document.querySelector('#custom-ok');
  const setup = document.querySelector('#setup');
  const preview = document.querySelector('#size-preview');
  const resize = document.querySelector('#size-resize');
  let pointer = null, drag = null;
  function renderPreview() {
    // Keep the last valid preview while a numeric field is incomplete or invalid.
    if (!validDimensions(Number(rows.value), Number(columns.value))) return;
    preview.style.setProperty('--rows', rows.value);
    preview.style.setProperty('--columns', columns.value);
    resize.setAttribute('aria-label', `Resize board: ${rows.value} rows, ${columns.value} columns. Use arrow keys to adjust`);
    if (dialog.open) position();
  }
  function updateLabel() {
    select.querySelector('[value="custom"]').textContent = `Custom (${custom.rows} × ${custom.columns})`;
    select.dispatchEvent(new Event('optionschange'));
  }
  if (saved.customRows && validDimensions(saved.customRows, saved.customColumns)) updateLabel();
  function validate() {
    const valid = /^[0-9]+$/.test(rows.value) && /^[0-9]+$/.test(columns.value) &&
      validDimensions(Number(rows.value), Number(columns.value));
    ok.disabled = !valid;
    warning.textContent = !valid && rows.value && columns.value ? 'Use 3–20 rows and columns' : '';
    for (const input of [rows, columns]) input.setAttribute('aria-invalid', String(Boolean(input.value) &&
      (!/^[0-9]+$/.test(input.value) || Number(input.value) < 3 || Number(input.value) > 20)));
    renderPreview();
    return valid;
  }
  function dragSize(event) {
    if (!drag) return;
    const size = (initial, delta) => Math.max(3, Math.min(20, Math.round(initial + delta / drag.cell)));
    rows.value = size(drag.rows, event.clientY - drag.y);
    columns.value = size(drag.columns, event.clientX - drag.x);
    validate();
  }
  preview.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    const board = document.querySelector('#size-preview-board').getBoundingClientRect();
    const shownRows = Number(preview.style.getPropertyValue('--rows'));
    const shownColumns = Number(preview.style.getPropertyValue('--columns'));
    drag = { x: event.clientX, y: event.clientY, rows: shownRows, columns: shownColumns,
      cell: board.width / shownColumns };
    preview.setPointerCapture(pointer);
    resize.focus({ preventScroll: true });
    preview.classList.add('is-dragging');
    if (event.target !== resize) {
      const rect = preview.getBoundingClientRect();
      rows.value = Math.max(3, Math.min(20, Math.round((event.clientY - rect.top) / rect.height * 20)));
      columns.value = Math.max(3, Math.min(20, Math.round((event.clientX - rect.left) / rect.width * 20)));
      drag.rows = Number(rows.value); drag.columns = Number(columns.value);
      validate();
    }
  });
  // Listen on window too: moving the handle under a touch/mouse pointer can
  // transfer capture in some browsers. The drag still follows outside the grid.
  window.addEventListener('pointermove', event => { if (event.pointerId === pointer) dragSize(event); });
  function stopDrag() { pointer = null; drag = null; preview.classList.remove('is-dragging'); }
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, event => {
    if (event.pointerId === pointer) stopDrag();
  });
  window.addEventListener('blur', stopDrag);
  resize.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    rows.value = Math.max(3, Math.min(20, (Number(rows.value) || 10) + step[0]));
    columns.value = Math.max(3, Math.min(20, (Number(columns.value) || 10) + step[1]));
    validate();
  });
  function position() {
    const rect = document.querySelector('.game-screen').getBoundingClientRect();
    dialog.style.left = `${Math.max(dialog.offsetWidth / 2 + 12, Math.min(innerWidth - dialog.offsetWidth / 2 - 12, rect.left + rect.width / 2))}px`;
    dialog.style.top = `${Math.max(dialog.offsetHeight / 2 + 12, Math.min(innerHeight - dialog.offsetHeight / 2 - 12, rect.top + rect.height / 2))}px`;
  }
  function close(accept = false) {
    if (!dialog.open) return;
    if (accept && validate()) {
      custom = { rows: Number(rows.value), columns: Number(columns.value) };
      previous = 'custom'; updateLabel();
    } else { select.value = previous; select.dispatchEvent(new Event('optionschange')); }
    dialog.close(); setup.classList.remove('is-customizing');
    stopDrag();
    document.querySelector('#size-trigger').focus({ preventScroll: true });
  }
  select.addEventListener('change', () => {
    if (select.value !== 'custom') { previous = select.value; return; }
    rows.value = custom.rows; columns.value = custom.columns; validate();
    setup.classList.add('is-customizing'); dialog.showModal(); renderPreview(); position(); resize.focus();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.animate(
      [{ opacity: 0, scale: '.95' }, { opacity: 1, scale: '1' }], { duration: 150, easing: 'ease-out' });
  });
  document.querySelector('#custom-form').addEventListener('submit', event => { event.preventDefault(); if (validate()) close(true); });
  document.querySelector('#custom-cancel').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  for (const input of [rows, columns]) { restrictToDigits(input); input.addEventListener('input', validate); }
  window.addEventListener('resize', () => { if (dialog.open) renderPreview(); });
  return {
    dimensions: () => select.value === 'custom' ? { ...custom } : { rows: Number(select.value), columns: Number(select.value) },
    preferences: () => ({ customRows: custom.rows, customColumns: custom.columns }),
    isOpen: () => dialog.open,
  };
}
