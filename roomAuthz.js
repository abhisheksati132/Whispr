'use strict';

const DM_ROOM_RE = /^dm_([a-z0-9_]+)_([a-z0-9_]+)$/;

function dmMembers(roomName) {
  const str = String(roomName || '');
  if (!str.startsWith('dm_')) return null;
  const rest = str.slice(3);
  if (rest.includes('--')) {
    const parts = rest.split('--');
    return parts.length === 2 ? parts : null;
  }
  const m = DM_ROOM_RE.exec(str);
  return m ? [m[1], m[2]] : null;
}

// Resolves a user's access to a room:
//   'member' — explicitly listed participant
//   'public' — legacy room with an empty participant list (open room, non-DM)
//   'denied' — everything else
async function authorizeRoom(mStore, roomName, username) {
  if (!roomName || !username) return 'denied';
  const clean = String(username).toLowerCase();
  try {
    const meta = await mStore.getRoomMeta(roomName);
    const participants = meta && Array.isArray(meta.participants) ? meta.participants : [];
    const names = participants.map(p => String(p).toLowerCase());
    if (names.includes(clean)) return 'member';
    if (names.length === 0) {
      if (meta && meta.type === 'dm') return 'denied';
      if (String(roomName).startsWith('dm_')) return 'denied';
      return 'public';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

function isMember(status) {
  return status === 'member';
}

function canRead(status) {
  return status === 'member' || status === 'public';
}

module.exports = { dmMembers, authorizeRoom, isMember, canRead };
