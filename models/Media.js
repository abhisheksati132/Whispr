const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  filename:  { type: String, required: true, unique: true, index: true },
  data:      { type: Buffer, required: true },
  mime:      { type: String, default: 'application/octet-stream' },
  size:      { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Media', mediaSchema);
