// routes/ai.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit for audio files
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// Chat with AI Assistant
// POST /api/ai/chat
router.post('/chat', aiController.chat);

// Transcribe audio to text
// POST /api/ai/transcribe
router.post('/transcribe', upload.single('audio'), aiController.transcribe);

// Convert text to speech
// POST /api/ai/speak
router.post('/speak', aiController.speak);

// AI services health check
// GET /api/ai/health
router.get('/health', aiController.healthCheck);

// Test endpoint for AI functionality
// GET /api/ai/test
router.get('/test', (req, res) => {
  res.json({
    message: 'Nuvho AI services are available',
    timestamp: new Date().toISOString(),
    endpoints: {
      chat: 'POST /api/ai/chat - Chat with Nuvho Analyst AI',
      transcribe: 'POST /api/ai/transcribe - Convert audio to text',
      speak: 'POST /api/ai/speak - Convert text to speech',
      health: 'GET /api/ai/health - Check AI services status'
    },
    requiredEnvVars: {
      OPENAI_API_KEY: 'Required for all AI features',
      OPENAI_ASSISTANT_ID: 'Optional - defaults to Nuvho Analyst'
    },
    features: [
      'Hotel analytics and insights via AI chat',
      'Voice-to-text transcription',
      'Text-to-speech responses',
      'Specialized hospitality knowledge base'
    ]
  });
});

module.exports = router;