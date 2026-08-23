export const ROOM_LABELS = { 'just-us': 'Just Us 💜', daily: 'Daily Check-In ☀️', cute: 'Sweet Notes 💕' };
export const ROOM_THEMES = { 'just-us': '', daily: 'theme-daily', cute: 'theme-cute' };
export const REACTIONS = ['❤️', '😂', '🥺', '🔥', '👀', '✨'];
export const EMOJIS = '😀😃😄😁😆🥹😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫣🤭🫢🫡🤫🫠🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾👋🤚🖐️✋🖖👌🤌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🧠🗣️👤👥🫂❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝❤️‍🔥❤️‍🩹✨🌟⭐💫💥🔥⚡🌈☀️🌙☁️🍕🌮🍔🍟🍦🍩🍰☕️🍺🍷🎉🎊🎁🎈🎈🎵🎤📸💭💬🦋🐱🐶🐰🐼🦊💖🌸🌺🌻'.match(/./gu) || [];
export const STICKERS = [
  { tags: ['cute','love'], url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif' },
  { tags: ['happy','love'], url: 'https://media.giphy.com/media/l0HlBO7eyXz4S3H4Y/giphy.gif' },
  { tags: ['hug','love'], url: 'https://media.giphy.com/media/lrr9rH7bbQusE/giphy.gif' },
  { tags: ['cute','happy'], url: 'https://media.giphy.com/media/3o7TKsQ8X3x8F2V2lC/giphy.gif' },
  { tags: ['love','sparkle'], url: 'https://media.giphy.com/media/26tn33aiTi1jkl6H6/giphy.gif' },
  { tags: ['cat','cute'], url: 'https://media.giphy.com/media/jd7vPTz4h9k4/giphy.gif' },
  { tags: ['happy','dance'], url: 'https://media.giphy.com/media/3o85xnoIXebk3xYx4Q/giphy.gif' },
  { tags: ['love','heart'], url: 'https://media.giphy.com/media/l0NwHXQy3kUSfFF60/giphy.gif' },
  { tags: ['sparkle','magic'], url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { tags: ['kiss','love'], url: 'https://media.giphy.com/media/l41K3tzVl3y5K/giphy.gif' },
  { tags: ['bye','wave'], url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { tags: ['meme','funny'], url: 'https://media.giphy.com/media/26n6WywOy1rOmJSmQ/giphy.gif' },
  { tags: ['sad','cat'], url: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif' },
  { tags: ['angry','cat'], url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif' },
  { tags: ['dance','funny'], url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif' },
  { tags: ['dog','funny'], url: 'https://media.giphy.com/media/13Hgw8T855x5a8/giphy.gif' },
  { tags: ['cat','vibe'], url: 'https://media.giphy.com/media/Bcfb1FhZ1xY1/giphy.gif' },
  { tags: ['heart','love'], url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
  { tags: ['cheers','party'], url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
  { tags: ['surprised','cat'], url: 'https://media.giphy.com/media/Cmr1OMJ2FN0B2/giphy.gif' }
];
export const VIBE_SUGGESTIONS = [
  'tired but happy 😴✨', 'need coffee ☕️', 'missing you 💭',
  'feeling grateful 🙏', 'daydreaming about us 🌈',
  'current mood: chaotic 🎭', 'sending good vibes ✨', "can't stop smiling 😊"
];
export const REMINDER_HOUR = 20;
export const MUSIC_DOMAINS = /^https?:\/\/(open\.spotify\.com|music\.apple\.com|soundcloud\.com|www\.youtube\.com|youtu\.be|spotify\.link)/i;
