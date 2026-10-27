// Start-menu dimensions only; no card identities are stored here.
export function setupBoardMenu() {
  const $ = id => document.getElementById(id);
  const select = $('board-size'), dialog = $('custom-size');
  const rows = $('custom-rows'), columns = $('custom-columns');
  const preview = $('size-preview'), fill = $('size-fill'), handle = $('size-handle');
  let custom = { rows: 6, columns: 6 }, previous = '4';
  const valid = () => [rows, columns].every(input => /^\d+$/.test(input.value) && +input.value >= 3 && +input.value <= 20);
  function render() {
    const r = Math.max(3, Math.min(20, +rows.value || 3));
    const c = Math.max(3, Math.min(20, +columns.value || 3));
    fill.style.width = `${c * 5}%`; fill.style.height = `${r * 5}%`;
    handle.style.left = `${c * 5}%`; handle.style.top = `${r * 5}%`;
    $('custom-ok').disabled = !valid();
    $('custom-warning').textContent = valid() ? '' : 'Use 3–20 rows and columns';
  }
  for (const input of [rows, columns]) {
    input.addEventListener('beforeinput', event => {
      if (event.data && /\D/.test(event.data)) event.preventDefault();
    });
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); render(); });
  }
  select.addEventListener('change', () => {
    if (select.value !== 'custom') { previous = select.value; return; }
    rows.value = custom.rows; columns.value = custom.columns; render(); dialog.showModal();
  });
  function cancel() {
    select.value = previous; select.dispatchEvent(new Event('optionschange')); dialog.close();
  }
  $('custom-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
  } });
  $('custom-form').addEventListener('submit', event => {
    event.preventDefault(); if (!valid()) return;
    custom = { rows: +rows.value, columns: +columns.value }; previous = 'custom';
    select.querySelector('[value="custom"]').textContent = `Custom (${custom.rows} × ${custom.columns})`;
    select.dispatchEvent(new Event('optionschange')); dialog.close();
  });
  function point(event) {
    const rect = preview.getBoundingClientRect();
    columns.value = Math.max(3, Math.min(20, Math.round((event.clientX - rect.left) / rect.width * 20)));
    rows.value = Math.max(3, Math.min(20, Math.round((event.clientY - rect.top) / rect.height * 20)));
    render();
  }
  preview.addEventListener('pointerdown', event => { event.preventDefault(); preview.setPointerCapture(event.pointerId); point(event); });
  preview.addEventListener('pointermove', event => { if (preview.hasPointerCapture(event.pointerId)) point(event); });
  handle.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); const input = ['ArrowUp', 'ArrowDown'].includes(event.key) ? rows : columns;
    input.value = Math.max(3, Math.min(20, +input.value + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1))); render();
  });
  return { value: () => select.value === 'custom' ? { ...custom } : { rows: +select.value, columns: +select.value } };
}
