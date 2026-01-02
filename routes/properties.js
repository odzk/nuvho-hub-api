// routes/properties.js
const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
// Use simple auth middleware for testing
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Create a new property (onboarding)
router.post('/', propertyController.createProperty);

// Get user's properties
router.get('/my-properties', propertyController.getUserProperties);

// Get all properties (admin only)
router.get('/all', propertyController.getAllProperties);

// Get property statistics (admin only)
router.get('/stats', propertyController.getPropertyStats);

// Get specific property by ID
router.get('/:id', propertyController.getProperty);

// Update property
router.put('/:id', propertyController.updateProperty);

// Update property status
router.patch('/:id/status', propertyController.updatePropertyStatus);

// Delete property
router.delete('/:id', propertyController.deleteProperty);

module.exports = router;