// routes/hubspot.js
const express = require('express');
const router = express.Router();
const hubspotController = require('../controllers/hubspotController');

// Get HubSpot integration status
router.get('/status', hubspotController.getStatus);

// Test HubSpot connection
router.get('/test-connection', hubspotController.testConnection);

// Create a test hotel in HubSpot (for testing integration)
router.post('/test-hotel', hubspotController.createTestHotel);

module.exports = router;