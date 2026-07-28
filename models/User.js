const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  pinHash:  { type: String, required: true },
  avatar:   { type: String, default: '✨' },
  color:    { type: String, default: '#818cf8' },
  statusBio:{ type: String, default: '' },
  nickname: { type: String, default: '' },
  createdAt:{ type: Number, default: () => Date.now() },
  lastSeen: { type: Number, default: () => Date.now() }
});

module.exports = mongoose.model('User', userSchema);
