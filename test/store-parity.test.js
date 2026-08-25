'use strict';
// Store parity contract tests — run identical scenarios against store.js (file)
// and supabaseStore.js (memory mode) and assert both honour the same contract.
// These guard against the API drift that has caused real bugs (setRoomMeta,
// getStarredMessages arity, rooms/create 409, FEELINGS key mismatches).

const test = require('node:test');
const assert = require('node:assert/strict');

const fileStore = require('../store');
const supaStore = require('../supabaseStore');

const STORES = [
  ['store.js (file)', fileStore],
  ['supabaseStore.js (memory)', supaStore],
];

// Methods the server calls via mStore.* — both stores must export them.
const REQUIRED_API = [
  'getProfile', 'updateProfile', 'getRoomMeta', 'updateRoomMeta',
  'getMessages', 'addMessage', 'editMessage', 'deleteMessage', 'clearHistory',
  'recordActivity', 'setLastSeen', 'getLastSeen', 'getFeelings', 'FEELINGS',
  'getDailyQuestion', 'getDailyQuestionState', 'saveDailyQuestionAnswer',
  'updateGameScore', 'getOrCreateDMRoom', 'listUserRooms', 'searchUsers',
  'getRoomMessagesPaginated', 'roomExists', 'getStarredMessages', 'starMessage',
  'saveUpload', 'getUploadsDir', 'isDbReady', 'pinMessage',
  'updateMessageReaction', 'updateReadReceipt', 'markMessageRead',
  'markMessageDelivered', 'markViewOnceOpened', 'updatePollVotes',
  'getUserByUsername', 'getUserByEmailOrUsername', 'createUser',
];

for (const [name, store] of STORES) {
  test(`[${name}] exports the full server-facing API`, () => {
    const missing = REQUIRED_API.filter((m) => typeof store[m] !== 'function' && store[m] === undefined);
    assert.deepEqual(missing, [], `missing methods: ${missing.join(', ')}`);
  });

  test(`[${name}] addMessage/getMessages round-trip`, async () => {
    const room = 'parity_' + Math.random().toString(36).slice(2, 8);
    const res = await store.addMessage(room, { user: 'alice', text: 'hello parity', type: 'text', room });
    assert.ok(res.message, 'addMessage returns { message }');
    assert.ok(res.message.id, 'message has id');
    assert.equal(res.message.text, 'hello parity');
    assert.ok(typeof res.message.time === 'number');
    const msgs = await store.getMessages(room, 10);
    assert.ok(Array.isArray(msgs));
    assert.ok(msgs.some((m) => m.id === res.message.id));
  });

  test(`[${name}] room meta contract`, async () => {
    const room = 'parity_meta_' + Math.random().toString(36).slice(2, 8);
    await store.updateRoomMeta(room, { mood: 'testy', participants: ['alice', 'bob'] });
    const meta = await store.getRoomMeta(room);
    assert.ok(meta, 'getRoomMeta returns object');
    assert.equal(meta.mood, 'testy');
    assert.deepEqual(meta.participants, ['alice', 'bob']);
    assert.equal(await store.roomExists(room), true);
    assert.equal(await store.roomExists('parity_never_' + Math.random()), false);
  });

  test(`[${name}] DM room contract`, async () => {
    const dm = await store.getOrCreateDMRoom('Alice', 'Bob');
    assert.ok(dm.roomName, 'returns roomName');
    assert.ok(Array.isArray(dm.participants));
    const again = await store.getOrCreateDMRoom('alice', 'bob');
    assert.equal(again.roomName, dm.roomName, 'deterministic DM room name');
    assert.ok(dm.roomName.startsWith('dm_'));
  });

  test(`[${name}] star contract`, async () => {
    const room = 'parity_star_' + Math.random().toString(36).slice(2, 8);
    const { message } = await store.addMessage(room, { user: 'alice', text: 'star me', type: 'text', room });
    await store.starMessage(room, message.id, 'bob', true);
    const starred = await store.getStarredMessages(room, 'bob');
    assert.ok(Array.isArray(starred));
    assert.ok(starred.some((m) => m.id === message.id), 'starred message retrievable');
  });

  test(`[${name}] profile contract`, async () => {
    await store.createUser({ username: 'parityuser' + Math.floor(Math.random() * 1e6), pinHash: 'x', nickname: 'Parity' });
    // use a fixed known user for profile ops
    const uname = 'parityprof_' + Math.random().toString(36).slice(2, 8);
    await store.createUser({ username: uname, pinHash: 'x', nickname: 'Prof' });
    const profile = await store.getProfile(uname);
    assert.ok(profile, 'getProfile returns object');
    assert.ok('avatar' in profile && 'nickname' in profile);
    const updated = await store.updateProfile(uname, { statusBio: 'testing' });
    assert.ok(updated, 'updateProfile returns profile');
  });

  test(`[${name}] daily question contract`, async () => {
    const room = 'parity_dq_' + Math.random().toString(36).slice(2, 8);
    const state = await store.getDailyQuestionState(room, 'alice');
    assert.ok(state, 'state object');
    assert.ok(state.question, 'has question');
    assert.ok(state.date, 'has date');
    const updated = await store.saveDailyQuestionAnswer(room, 'alice', 'my answer');
    assert.ok(updated, 'saveDailyQuestionAnswer returns state');
  });

  test(`[${name}] game score contract`, async () => {
    const room = 'parity_game_' + Math.random().toString(36).slice(2, 8);
    const scores = await store.updateGameScore(room, 'alice');
    assert.ok(scores, 'returns scores');
    assert.ok('wins' in scores && 'losses' in scores, 'has wins/losses');
  });

  test(`[${name}] streak contract`, async () => {
    const streak = store.recordActivity('parity_streak_user');
    assert.ok(streak, 'recordActivity returns streak');
    assert.ok(typeof streak.days === 'number', 'has numeric days');
  });

  test(`[${name}] feelings contract`, async () => {
    assert.ok(store.FEELINGS && typeof store.FEELINGS === 'object');
    const keys = Object.keys(store.FEELINGS);
    assert.ok(keys.length > 0, 'FEELINGS palette non-empty');
    const result = await store.setFeeling('parity_feel_user', keys[0]);
    assert.ok(result !== undefined, 'setFeeling accepts a valid key');
    const bad = await store.setFeeling('parity_feel_user', 'not-a-feeling');
    assert.equal(bad, null, 'setFeeling rejects unknown key with null');
    const all = await store.getFeelings();
    assert.ok(all && typeof all === 'object');
  });

  test(`[${name}] pagination contract`, async () => {
    const room = 'parity_pag_' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < 5; i++) {
      await store.addMessage(room, { user: 'alice', text: 'msg ' + i, type: 'text', room });
    }
    const page = await store.getRoomMessagesPaginated(room, null, 3);
    assert.equal(page.length, 3, 'respects limit');
  });

  test(`[${name}] listUserRooms includes own rooms`, async () => {
    const uname = 'paritylist_' + Math.random().toString(36).slice(2, 8);
    await store.getOrCreateDMRoom(uname, uname);
    const rooms = await store.listUserRooms(uname);
    assert.ok(Array.isArray(rooms) && rooms.length > 0);
    const names = rooms.map((r) => r.roomName || r.name);
    assert.ok(names.includes(`dm_${uname}_${uname}`), 'saved-messages room present');
  });

  test(`[${name}] edit/delete contract`, async () => {
    const room = 'parity_ed_' + Math.random().toString(36).slice(2, 8);
    const { message } = await store.addMessage(room, { user: 'alice', text: 'original', type: 'text', room });
    const edited = await store.editMessage(room, message.id, 'edited');
    assert.ok(edited, 'editMessage returns message');
    assert.equal(edited.text, 'edited');
    const removed = await store.deleteMessage(room, message.id);
    assert.ok(removed, 'deleteMessage returns message');
    assert.equal(removed.deleted, true, 'message flagged deleted');
  });
}
