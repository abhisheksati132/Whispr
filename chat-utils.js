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
    { q: 'Would you rather…', a: 'Always be 10 min early ⏰', b: 'Always be 10 min late 😅' },
    { q: 'Would you rather…', a: 'Know the future 🔮', b: 'Change the past ⏰' },
    { q: 'Would you rather…', a: 'No internet for a month 📵', b: 'No music for a month 🎵' },
    { q: 'Would you rather…', a: 'Be always cold 🥶', b: 'Be always hot 🥵' },
    { q: 'Would you rather…', a: 'Read minds 🧠', b: 'Be invisible 👻' }
  ],
  'this-or-that': [
    { q: 'This or that?', a: 'Sunrise person 🌅', b: 'Night owl 🦉' },
    { q: 'This or that?', a: 'Texts 💬', b: 'Voice notes 🎤' },
    { q: 'This or that?', a: 'Sweet snacks 🍰', b: 'Savory snacks 🍟' },
    { q: 'This or that?', a: 'Rainy day cozy ☔', b: 'Sunny day adventure ☀️' },
    { q: 'This or that?', a: 'Binge watching 📺', b: 'Reading 📚' },
    { q: 'This or that?', a: 'Big group hangout 🎉', b: 'Cozy small squad 💕' },
    { q: 'This or that?', a: 'Overthinking 🌀', b: 'Spontaneous 🎲' },
    { q: 'This or that?', a: 'Save money 💰', b: 'Spend on experiences 🌍' }
  ],
  'truth': [
    'Truth: What is a small thing that always makes you happy?',
    'Truth: What is something you have been overthinking lately?',
    'Truth: What is your comfort show or song right now?',
    'Truth: What is one thing you wish I knew about your day?',
    'Truth: What always cheers you up when you are feeling down?',
    'Truth: What is something you have never told anyone?',
    'Truth: What is your most irrational fear?',
    'Truth: What is a habit you are secretly proud of?',
    'Truth: What moment made you feel the most proud of yourself?',
    'Truth: What do you think about right before you fall asleep?'
  ],
  'dare': [
    'Dare: Send the 5th photo in your camera roll 📸',
    'Dare: Voice note saying something nice about me in 5 seconds 🎤',
    'Dare: Send your most-used emoji with zero context',
    'Dare: Describe your mood using only emojis 🎭',
    'Dare: Text someone you haven\'t talked to in a while',
    'Dare: Send a 10-second voice note singing any song 🎵',
    'Dare: Tell me a secret no one else knows 🤫',
    'Dare: Send your most embarrassing photo from last year 📸'
  ],
  'never-have-i-ever': [
    'Never have I ever stayed up all night texting someone 💬',
    'Never have I ever cried at a movie 🎬😢',
    'Never have I ever sent a text to the wrong person 😬',
    'Never have I ever pretended not to see a notification 👀',
    'Never have I ever eaten an entire pizza by myself 🍕',
    'Never have I ever laughed so hard I cried 😂',
    'Never have I ever faked being sick to avoid plans 😷',
    'Never have I ever screenshot someone\'s story without them knowing 📸',
    'Never have I ever stayed awake past 3am for no reason',
    'Never have I ever cancelled plans at the last minute 😬'
  ],
  'emoji-story': [
    'Tell our whole friendship story using only 5 emojis 🎭',
    'Describe your day in exactly 3 emojis — I\'ll guess what happened!',
    'Tell me your dream day using only emojis ✨',
    'Describe your current mood with exactly one emoji combo',
    'Describe your favourite movie plot using only emojis 🎬'
  ],
  'finish-sentence': [
    'Finish the sentence: The best thing about you is…',
    'Finish the sentence: If we were in a movie, we would be…',
    'Finish the sentence: My favourite memory of us is…',
    'Finish the sentence: You always make me feel…',
    'Finish the sentence: In 10 years, I imagine us…',
    'Finish the sentence: The thing I admire most about you is…',
    'Finish the sentence: When I\'m having a bad day, I think about…',
    'Finish the sentence: Our friendship is like…'
  ],
  'rapid-fire': [
    'Rapid Fire! Answer FAST: Coffee or Tea? | Books or Movies? | Morning or Night? | Text or Call? | Cats or Dogs?',
    'Rapid Fire! Answer FAST: Summer or Winter? | Sweet or Spicy? | City or Nature? | Introvert or Extrovert? | Logic or Feelings?',
    'Rapid Fire! Answer FAST: Past or Future? | Love or Money? | Adventure or Comfort? | Early or Late? | Talking or Listening?',
    'Rapid Fire! Answer FAST: Photos or Videos? | Cook or Order out? | Alone time or Social? | Planner or Go-with-flow? | Hugs or Handshakes?'
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
