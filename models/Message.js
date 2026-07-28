const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  room:      { type: String, required: true, index: true },
  user:      { type: String, required: true },
  text:      { type: String, default: '' },
  type:      { type: String, default: 'text' },
  url:       { type: String, default: '' },
  duration:  { type: Number, default: 0 },
  replyTo:   { type: mongoose.Schema.Types.Mixed, default: null },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
  votes:     { type: mongoose.Schema.Types.Mixed, default: {} },
  editedAt:  { type: Number, default: 0 },
  deleted:   { type: Boolean, default: false },
  expired:   { type: Boolean, default: false },
  time:      { type: Number, required: true }
});

messageSchema.index({ room: 1, time: 1 });

module.exports = mongoose.model('Message', messageSchema);
