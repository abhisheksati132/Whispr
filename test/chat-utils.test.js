const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeName,
  normalizeRoom,
  normalizeText,
  normalizeNickname,
  randomJoinMessage,
  randomGamePrompt,
  isImageUrl
} = require('../chat-utils');
const store = require('../store');

test('normalizeName trims and caps length', () => {
  assert.equal(normalizeName('  Maya  '), 'Maya');
  assert.equal(normalizeName('x'.repeat(30)), 'x'.repeat(20));
});

test('normalizeRoom creates a safe room key', () => {
  assert.equal(normalizeRoom(' Bestie Room '), 'bestie-room');
  assert.equal(normalizeRoom('!!!'), 'bestie');
});

test('normalizeText trims and caps message length', () => {
  assert.equal(normalizeText('  hello  '), 'hello');
  assert.equal(normalizeText('x'.repeat(3000)), 'x'.repeat(2000));
});

test('normalizeNickname falls back when empty', () => {
  assert.equal(normalizeNickname('  Sunshine  ', 'Maya'), 'Sunshine');
  assert.equal(normalizeNickname('', 'Maya'), 'Maya');
});

test('randomJoinMessage includes the name', () => {
  assert.match(randomJoinMessage('Maya'), /Maya/);
});

test('randomGamePrompt returns a game object', () => {
  const game = randomGamePrompt('truth');
  assert.ok(game);
  assert.equal(game.type, 'truth');
});

test('isImageUrl detects image links', () => {
  assert.equal(isImageUrl('https://example.com/pic.png'), true);
  assert.equal(isImageUrl('hello'), false);
});

test('store persists messages and milestones', () => {
  store.resetForTests();
  const { message, milestone } = store.addMessage('just-us', { user: 'A', text: 'hi', type: 'text' });
  assert.ok(message.id);
  assert.equal(milestone, null);
  const room = store.getRoom('just-us');
  assert.equal(room.messages.length, 1);
  assert.equal(room.messageCount, 1);
});

test('store sets and expires feelings', () => {
  store.resetForTests();
  const f = store.setFeeling('Alice', 'happy');
  assert.equal(f.key, 'happy');
  assert.deepEqual(Object.keys(store.getFeelings()), ['Alice']);
  store.clearFeeling('Alice');
  assert.deepEqual(store.getFeelings(), {});
});

test('store rejects unknown feeling keys', () => {
  store.resetForTests();
  const f = store.setFeeling('Alice', 'not-a-real-feeling');
  assert.equal(f, null);
});

test('store tracks streak activity', () => {
  store.resetForTests();
  store.recordActivity('Alice');
  store.recordActivity('Bob');
  const streak = store.getStreak();
  assert.equal(streak.usersToday.length, 2);
});
