const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name:             { type: String, required: true, unique: true },
  type:             { type: String, enum: ['public','dm','group'], default: 'public' },
  participants:     [{ type: String }],
  mood:             { type: String, default: '' },
  jokes:            [{ type: String }],
  countdown:        { type: mongoose.Schema.Types.Mixed, default: {} },
  pinnedMessageId:  { type: String, default: null },
  disappearingTimer:{ type: Number, default: 0 },
  roomPassword:     { type: String, default: '' },
  messageCount:     { type: Number, default: 0 },
  milestonesHit:    [{ type: Number }],
  readBy:           { type: mongoose.Schema.Types.Mixed, default: {} },
  diary:            { type: mongoose.Schema.Types.Mixed, default: [] },
  bucketList:       { type: mongoose.Schema.Types.Mixed, default: [] },
  calendar:         { type: mongoose.Schema.Types.Mixed, default: [] },
  glossary:         { type: mongoose.Schema.Types.Mixed, default: [] },
  bonsai:           { type: mongoose.Schema.Types.Mixed, default: { growth: 0, lastWatered: null } },
  gameScores:       { type: mongoose.Schema.Types.Mixed, default: { wins: {}, losses: {} } },
  sharedPad:        { type: String, default: '' },
  lastActivity:     { type: Number, default: () => Date.now() },
  createdAt:        { type: Number, default: () => Date.now() }
});

module.exports = mongoose.model('Room', roomSchema);
