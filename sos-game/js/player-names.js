const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function characters(value) {
  return segmenter ? Array.from(segmenter.segment(value), part => part.segment) : Array.from(value);
}

export function limitName(value) {
  let result = '';
  for (const character of characters(value)) {
    if (result.length + character.length > 20) break;
    result += character;
  }
  return result;
}

export function setupNameInput(input, onChange = () => {}) {
  let composing = false;
  const report = () => onChange(input.value.length);
  const normalize = () => {
    const value = limitName(input.value);
    if (value !== input.value) {
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? start;
      input.value = value;
      input.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
    }
    report();
  };
  const wouldOverflow = text => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    return input.value.length - (end - start) + text.length > input.maxLength;
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Array.from(event.key).length === 1 && wouldOverflow(event.key)) event.preventDefault();
  });
  input.addEventListener('beforeinput', event => {
    // Mobile IME preedit is temporary and may not be cancellable. Show its actual
    // length, then normalize at commit rather than interrupting composition.
    if (composing || event.isComposing || event.inputType === 'insertCompositionText') return;
    if (!event.inputType?.startsWith('insert')) return;
    const text = event.data ?? event.dataTransfer?.getData('text/plain');
    if (text && wouldOverflow(text) && event.cancelable) event.preventDefault();
  });
  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain');
    if (!composing && text && wouldOverflow(text)) event.preventDefault();
  });
  input.addEventListener('input', event => {
    if (composing || event.isComposing) report();
    else normalize();
  });
  input.addEventListener('compositionend', () => { composing = false; normalize(); });
  input.addEventListener('blur', () => { composing = false; normalize(); });
  report();
}
