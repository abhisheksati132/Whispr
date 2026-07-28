const mongoose = require('mongoose');

const pushSubSchema = new mongoose.Schema({
  username: { type: String, required: true },
  endpoint: { type: String, required: true, unique: true },
  keys:     { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:{ type: Number, default: () => Date.now() }
});

module.exports = mongoose.model('PushSub', pushSubSchema);
