'use strict';

const DM_ROOM_RE = /^dm_([a-z0-9_]+)_([a-z0-9_]+)$/;

function dmMembers(roomName) {
  const m = DM_ROOM_RE.exec(String(roomName || ''));
  return m ? [m[1], m[2]] : null;
}

// Resolves a user's access to a room:
//   'member' — explicitly listed participant (or both halves of a DM)
//   'public' — legacy room with an empty participant list (open room)
//   'denied' — everything else
async function authorizeRoom(mStore, roomName, username) {
  if (!roomName || !username) return 'denied';
  const clean = String(username).toLowerCase();
  const dm = dmMembers(roomName);
  if (dm) return dm.includes(clean) ? 'member' : 'denied';
  try {
    const meta = await mStore.getRoomMeta(roomName);
    const participants = meta && Array.isArray(meta.participants) ? meta.participants : [];
    const names = participants.map(p => String(p).toLowerCase());
    if (names.includes(clean)) return 'member';
    if (names.length === 0) return 'public';
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
