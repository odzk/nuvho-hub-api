// routes/scraping.js - Complete routes matching frontend API expectations
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  scrapeUrls,
  testUrl,
  getStatus,
  getFiles,
  uploadFileToOpenAI,
  downloadFile,
  healthCheck
} = require('../controllers/scrapingController');

// Health check endpoint (no auth required)
router.get('/health', healthCheck);

// System status endpoint (with auth)
router.get('/status', auth, getStatus);

// Get generated files list (with auth)
router.get('/files', auth, getFiles);

// Main scraping endpoint (matches frontend: scrapeUrls)
router.post('/scrape-urls', auth, scrapeUrls);

// Test URL endpoint (matches frontend: testUrl)
router.post('/test-url', auth, testUrl);

// Upload file to OpenAI (matches frontend: uploadToOpenAI)
router.post('/upload-to-openai', auth, uploadFileToOpenAI);

// Download file endpoint (with auth)
router.get('/download/:filename', auth, downloadFile);

// Debug route for testing (optional)
router.get('/debug', auth, (req, res) => {
  res.json({
    message: 'Scraping API Debug Endpoint',
    timestamp: new Date().toISOString(),
    user: req.user?.uid || 'Unknown',
    availableEndpoints: [
      'GET /health',
      'GET /status',
      'GET /files', 
      'POST /scrape-urls',
      'POST /test-url',
      'POST /upload-to-openai',
      'GET /download/:filename'
    ]
  });
});

module.exports = router;