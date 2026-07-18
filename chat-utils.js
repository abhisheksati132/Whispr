const JOIN_MESSAGES = [
  '{name} entered the chat corner ✨',
  'Your bestie {name} is here!! 💖',
  '{name} just pulled up — the vibes just got better 🌟',
  'Look who it is… {name}! 👀💕',
  '{name} joined the party 🎉',
  'Spotted: {name} in the wild 🦋'
];

const LEAVE_MESSAGES = [
  '{name} slipped out quietly 👋',
  '{name} will be back soon (probably) 💭',
  '{name} left to go be amazing elsewhere ✨',
  'Catch you later, {name}! 🌙'
];

const GAME_PROMPTS = {
  'would-you-rather': [
    { q: 'Would you rather…', a: 'Pizza forever 🍕', b: 'Tacos forever 🌮' },
    { q: 'Would you rather…', a: 'Never use phone again 📵', b: 'Never watch movies again 🎬' },
    { q: 'Would you rather…', a: 'Live at the beach 🏖️', b: 'Live in the mountains ⛰️' },
    { q: 'Would you rather…', a: 'Always be 10 min early ⏰', b: 'Always be 10 min late 😅' }
  ],
  'this-or-that': [
    { q: 'This or that?', a: 'Sunrise person 🌅', b: 'Night owl 🦉' },
    { q: 'This or that?', a: 'Texts 💬', b: 'Voice notes 🎤' },
    { q: 'This or that?', a: 'Sweet snacks 🍰', b: 'Savory snacks 🍟' },
    { q: 'This or that?', a: 'Rainy day cozy ☔', b: 'Sunny day adventure ☀️' }
  ],
  'truth': [
    'Truth: What is a small thing that always makes you happy?',
    'Truth: What is something you have been overthinking lately?',
    'Truth: What is your comfort show or song right now?',
    'Truth: What is one thing you wish I knew about your day?'
  ],
  'dare': [
    'Dare: Send the 5th photo in your camera roll 📸',
    'Dare: Voice note saying something nice in 5 seconds 🎤',
    'Dare: Send your most-used emoji with zero context',
    'Dare: Describe your mood using only emojis 🎭'
  ]
};

function normalizeName(name) {
  return (name || 'Anonymous').trim().slice(0, 20) || 'Anonymous';
}

function normalizeRoom(room) {
  const cleaned = (room || 'bestie').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'bestie';
}

function normalizeText(text) {
  return (text || '').trim().slice(0, 2000) || '';
}

function normalizeNickname(nickname, fallback) {
  const cleaned = (nickname || fallback || '').trim().slice(0, 24);
  return cleaned || fallback;
}

function randomJoinMessage(name) {
  const tpl = JOIN_MESSAGES[Math.floor(Math.random() * JOIN_MESSAGES.length)];
  return tpl.replace('{name}', name);
}

function randomLeaveMessage(name) {
  const tpl = LEAVE_MESSAGES[Math.floor(Math.random() * LEAVE_MESSAGES.length)];
  return tpl.replace('{name}', name);
}

function randomGamePrompt(type) {
  const list = GAME_PROMPTS[type];
  if (!list) return null;
  const item = list[Math.floor(Math.random() * list.length)];
  if (typeof item === 'string') return { type, text: item };
  return { type, ...item };
}

function isImageUrl(text) {
  return /^https?:\/\/.+\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(text.trim());
}

module.exports = {
  normalizeName,
  normalizeRoom,
  normalizeText,
  normalizeNickname,
  randomJoinMessage,
  randomLeaveMessage,
  randomGamePrompt,
  isImageUrl,
  JOIN_MESSAGES,
  GAME_PROMPTS
};
