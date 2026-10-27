'use strict';
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');
const { requireAuth } = require('./auth');

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (voice notes max 5 min / 25MB, photos)

// In-memory test store when Supabase is not configured
const memMedia = new Map();

function resetMediaForTests() {
  memMedia.clear();
}

// Magic bytes validator for allowed media formats
function detectMimeType(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // WebM / EBML: 1A 45 DF A3
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return { mime: 'audio/webm', ext: 'webm' };
  }

  // Ogg: 4F 67 67 53 (OggS)
  if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { mime: 'audio/ogg', ext: 'ogg' };
  }

  // MP4 / M4A / AAC (Safari voice): 'ftyp' box at byte 4
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    return { mime: 'audio/mp4', ext: 'm4a' };
  }

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

function createMediaRouter() {
  const router = express.Router();

  // POST /api/media/upload
  router.post('/upload', requireAuth, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File size exceeds maximum limit of 25MB' });
        }
        return res.status(400).json({ error: 'Upload failed' });
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const detected = detectMimeType(req.file.buffer);
      if (!detected) {
        return res.status(400).json({ error: 'Invalid file content: only photos and voice notes are allowed' });
      }

      const fileId = `${crypto.randomUUID()}.${detected.ext}`;

      if (db.isConfigured()) {
        try {
          const { error: uploadError } = await db.supabase.storage
            .from('whispr-media')
            .upload(fileId, req.file.buffer, {
              contentType: detected.mime,
              upsert: false
            });
          if (uploadError) {
            console.error('Supabase storage upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload media to storage' });
          }

          // Return mediaPath pointing to our authenticated media retrieval route
          return res.status(201).json({
            mediaPath: `/api/media/${fileId}`,
            mime: detected.mime,
            size: req.file.buffer.length
          });
        } catch (e) {
          console.error('Storage exception:', e);
          return res.status(500).json({ error: 'Failed to upload media to storage' });
        }
      }

      // Memory storage fallback for dev/test
      memMedia.set(fileId, {
        buffer: req.file.buffer,
        mime: detected.mime,
        size: req.file.buffer.length
      });

      return res.status(201).json({
        mediaPath: `/api/media/${fileId}`,
        mime: detected.mime,
        size: req.file.buffer.length
      });
    });
  });

  // GET /api/media/:fileId (Authenticated media access)
  router.get('/:fileId', requireAuth, async (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId || fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')) {
        return res.status(400).json({ error: 'Invalid file parameter' });
      }

      if (db.isConfigured()) {
        const { data, error } = await db.supabase.storage
          .from('whispr-media')
          .download(fileId);

        if (error || !data) {
          return res.status(404).json({ error: 'File not found' });
        }

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const detected = detectMimeType(buffer);

        res.setHeader('Content-Type', detected ? detected.mime : 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.send(buffer);
      }

      const item = memMedia.get(fileId);
      if (!item) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.setHeader('Content-Type', item.mime);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.send(item.buffer);
    } catch (err) {
      console.error('Media download error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = {
  createMediaRouter,
  detectMimeType,
  resetMediaForTests
};
