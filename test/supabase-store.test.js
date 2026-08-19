'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../supabaseStore');
const client = require('../supabaseClient');

test('supabaseClient reports connection state correctly when unconfigured', async () => {
  assert.equal(typeof client.isConfigured(), 'boolean');
  const status = await client.checkConnection();
  assert.equal(typeof status.connected, 'boolean');
});

test('supabaseStore handles room metadata operations', async () => {
  const roomName = 'test-room-' + Date.now();
  const meta = await store.getRoomMeta(roomName);
  assert.equal(meta.name, roomName);
  assert.equal(meta.messageCount, 0);
  assert.deepEqual(meta.jokes, []);

  await store.updateRoomMeta(roomName, { mood: 'feeling great ✨', jokes: ['Why did the chicken cross the road?'] });
  const updated = await store.getRoomMeta(roomName);
  assert.equal(updated.mood, 'feeling great ✨');
  assert.equal(updated.jokes.length, 1);
});

test('supabaseStore handles message lifecycle & milestones', async () => {
  const room = 'msg-test-room';
  const { message, milestone } = await store.addMessage(room, {
    user: 'Alice',
    text: 'Hello Supabase!'
  });

  assert.ok(message.id);
  assert.equal(message.user, 'Alice');
  assert.equal(message.text, 'Hello Supabase!');
  assert.equal(milestone, null);

  const list = await store.getMessages(room, 50);
  assert.ok(list.length >= 1);
  assert.equal(list[list.length - 1].id, message.id);

  // Edit message
  const edited = await store.editMessage(room, message.id, 'Hello Postgres!');
  assert.equal(edited.text, 'Hello Postgres!');
  assert.ok(edited.editedAt > 0);

  // Find message
  const found = await store.findMessage(room, message.id);
  assert.equal(found.text, 'Hello Postgres!');

  // Star message
  await store.starMessage(room, message.id, 'Alice', true);
  const starred = await store.getStarredMessages(room, 'Alice');
  assert.ok(starred.some(m => m.id === message.id));

  // Reactions
  const reacted = await store.updateMessageReaction(room, message.id, '❤️', 'Bob', true);
  assert.ok(reacted.reactions['❤️'].includes('Bob'));

  // Delete message
  await store.deleteMessage(room, message.id);
  const afterDel = await store.findMessage(room, message.id);
  assert.equal(afterDel.deleted, true);
});

test('supabaseStore manages users and profiles', async () => {
  const uname = 'testuser_' + Date.now();
  const created = await store.createUser({
    username: uname,
    pinHash: 'hashed_password_123',
    avatar: '🐱',
    color: '#34d399'
  });

  assert.equal(created.username, uname);
  assert.equal(created.avatar, '🐱');

  const fetched = await store.getUserByUsername(uname);
  assert.equal(fetched.username, uname);
  assert.equal(fetched.pinHash, 'hashed_password_123');

  const profile = await store.getProfile(uname);
  assert.equal(profile.avatar, '🐱');

  await store.updateProfile(uname, { nickname: 'CoolCat', statusBio: 'Chilling out' });
  const updatedProf = await store.getProfile(uname);
  assert.equal(updatedProf.nickname, 'CoolCat');
  assert.equal(updatedProf.statusBio, 'Chilling out');
});

test('supabaseStore handles DM room creation and user search', async () => {
  const dm = await store.getOrCreateDMRoom('Alice', 'Bob');
  assert.equal(dm.roomName, 'dm_alice_bob');
  assert.deepEqual(dm.participants, ['alice', 'bob']);

  await store.createUser({ username: 'sammy_test', pinHash: '123', avatar: '🌟' });
  const results = await store.searchUsers('sammy', 'other_user');
  assert.ok(results.some(u => u.username === 'sammy_test'));
});

test('supabaseStore handles daily question flow and lock-until-reveal', async () => {
  const room = 'dq-test-room';
  const q = store.getDailyQuestion();
  assert.ok(typeof q === 'string' && q.length > 0);

  const state1 = await store.saveDailyQuestionAnswer(room, 'User1', 'Eating pizza');
  assert.equal(state1.revealed, false);

  const user2View = await store.getDailyQuestionState(room, 'User2');
  assert.equal(user2View.revealed, false);

  const state2 = await store.saveDailyQuestionAnswer(room, 'User2', 'Coding all night');
  assert.equal(state2.revealed, true);
  assert.equal(state2.answers['User1'].text, 'Eating pizza');
  assert.equal(state2.answers['User2'].text, 'Coding all night');
});

test('supabaseStore manages game scores and feelings', async () => {
  const room = 'game-test-room';
  const scores = await store.updateGameScore(room, 'Player1');
  assert.equal(scores.wins['Player1'], 1);

  const feeling = store.setFeeling('Player1', 'happy');
  assert.equal(feeling.emoji, '😊');
  assert.equal(store.getFeelings()['Player1'].key, 'happy');
});
