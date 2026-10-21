import test from 'node:test';
import assert from 'node:assert/strict';
import { limitName, setupNameInput } from '../sos-game/js/player-names.js';

test('player names accept Unicode without splitting visible characters', () => {
  for (const character of ['界', 'Ж', 'ع', '★', 'e\u0301', '👩🏽‍🚀']) {
    assert.equal(limitName(character.repeat(21)), character.repeat(Math.floor(20 / character.length)));
  }
  assert.equal(limitName('<Alex & Sam>'), '<Alex & Sam>');
});

test('name limit blocks cancellable typing, replacement and paste before editing', () => {
  const handlers = {};
  const input = { value: '界'.repeat(20), selectionStart: 20, selectionEnd: 20, maxLength: 20,
    addEventListener: (name, handler) => { handlers[name] = handler; } };
  setupNameInput(input);
  let blocked = false;
  const event = { cancelable: true, inputType: 'insertText', data: '★', preventDefault: () => { blocked = true; } };
  handlers.beforeinput(event);
  assert.equal(blocked, true);
  blocked = false;
  input.selectionStart = 19;
  handlers.beforeinput(event);
  assert.equal(blocked, false);
  input.selectionStart = 20;
  for (const inputType of ['insertText', 'insertReplacementText', 'insertFromPaste']) {
    blocked = false;
    handlers.beforeinput({ ...event, inputType });
    assert.equal(blocked, true, inputType);
  }
  blocked = false;
  handlers.keydown({ key: '★', preventDefault: () => { blocked = true; } });
  assert.equal(blocked, true);
  blocked = false;
  handlers.paste({ clipboardData: { getData: () => 'extra' }, preventDefault: () => { blocked = true; } });
  assert.equal(blocked, true);

});

function nameField(value, onChange) {
  const handlers = {};
  const input = { value, selectionStart: value.length, selectionEnd: value.length, maxLength: 20,
    addEventListener: (type, handler) => { handlers[type] = handler; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  setupNameInput(input, onChange);
  return { input, handlers };
}

test('IME overflow reports the full count until commit, then reports the trimmed count', () => {
  const before = '界'.repeat(19), counts = [];
  const { input, handlers } = nameField(before, count => counts.push(count));
  handlers.compositionstart();
  handlers.beforeinput({ inputType: 'insertCompositionText', data: 'abcde', cancelable: false });
  input.value += 'abcde'; input.selectionStart = input.selectionEnd = 24;
  handlers.input({ isComposing: true });
  assert.equal(input.value, before + 'abcde');
  assert.equal(counts.at(-1), 24);
  handlers.compositionend();
  assert.equal(input.value, before + 'a');
  assert.equal(input.selectionStart, 20);
  assert.equal(counts.at(-1), 20);
});

test('composition replaces its active word rather than counting it twice', () => {
  const { input, handlers } = nameField('A'.repeat(15));
  handlers.compositionstart();
  for (const word of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
    handlers.beforeinput({ inputType: 'insertCompositionText', data: word, cancelable: false });
    input.value = 'A'.repeat(15) + word;
    input.selectionStart = input.selectionEnd = input.value.length;
    handlers.input({});
    assert.equal(input.value, 'A'.repeat(15) + word);
  }
  handlers.compositionend();
});

test('a non-composition overflow is normalized and feedback immediately reflects its new length', () => {
  const counts = [];
  const { input, handlers } = nameField('A'.repeat(19), count => counts.push(count));
  input.value += 'hello';
  handlers.input({});
  assert.equal(input.value, 'A'.repeat(19) + 'h');
  assert.equal(counts.at(-1), 20);
});
