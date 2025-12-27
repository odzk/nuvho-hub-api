// routes/search.js
const express = require('express');
const router = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { 
  searchHotels, 
  findSimilarHotels,
  generateHotelEmbedding,
  generateAllHotelEmbeddings
} = require('../services/embeddingService');
const { getIndexStats } = require('../config/pinecone');

// Use optional auth for most routes (allows both authenticated and anonymous access)
// To require authentication, change optionalAuth to verifyToken

// Semantic search for hotels
router.post('/hotels', optionalAuth, async (req, res) => {
  try {
    const { query, topK = 10, filters = {} } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        message: 'Search query is required',
        error: 'Query parameter cannot be empty'
      });
    }

    const results = await searchHotels(query.trim(), { topK, filters });

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

// Find similar hotels to a specific hotel
router.get('/hotels/:id/similar', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { topK = 5 } = req.query;

    const results = await findSimilarHotels(parseInt(id), { topK: parseInt(topK) });

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Similar hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find similar hotels',
      error: error.message
    });
  }
});

// Generate embedding for a specific hotel
router.post('/hotels/:id/embedding', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await generateHotelEmbedding(parseInt(id));

    res.json({
      success: true,
      message: 'Embedding generated successfully',
      data: {
        hotel_id: result.propertyId,
        metadata: result.metadata
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Embedding generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate embedding',
      error: error.message
    });
  }
});

// Batch generate embeddings for all hotels (admin only)
router.post('/hotels/embeddings/generate-all', verifyToken, async (req, res) => {
  try {
    // Optional: Add admin check here
    if (req.user && req.user.role && !['superadmin', 'superuser'].includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Admin access required',
        error: 'Insufficient permissions'
      });
    }

    // Start the batch process (don't await - it can take a long time)
    generateAllHotelEmbeddings()
      .then(result => {
        console.log('Batch embedding generation completed:', result);
      })
      .catch(error => {
        console.error('Batch embedding generation failed:', error);
      });

    res.json({
      success: true,
      message: 'Batch embedding generation started',
      note: 'This process will run in the background. Check server logs for progress.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch embedding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start batch embedding generation',
      error: error.message
    });
  }
});

// Advanced search with filters
router.post('/hotels/advanced', optionalAuth, async (req, res) => {
  try {
    const { 
      query, 
      topK = 10, 
      city,
      country,
      category,
      type,
      min_rooms,
      max_rooms,
      status = 'active'
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        message: 'Search query is required',
        error: 'Query parameter cannot be empty'
      });
    }

    // Build filters for Pinecone
    const filters = { status };
    
    if (city) filters.city = city;
    if (country) filters.country = country;
    if (category) filters.category = category;
    if (type) filters.type = type;
    if (min_rooms) filters.total_rooms = { $gte: parseInt(min_rooms) };
    if (max_rooms) {
      if (filters.total_rooms) {
        filters.total_rooms.$lte = parseInt(max_rooms);
      } else {
        filters.total_rooms = { $lte: parseInt(max_rooms) };
      }
    }

    const results = await searchHotels(query.trim(), { topK, filters });

    res.json({
      success: true,
      data: results,
      filters_applied: filters,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      success: false,
      message: 'Advanced search failed',
      error: error.message
    });
  }
});

// Get search statistics and index information
router.get('/stats', async (req, res) => {
  try {
    const indexStats = await getIndexStats();
    
    res.json({
      success: true,
      data: {
        index_stats: indexStats,
        features: {
          semantic_search: true,
          similarity_matching: true,
          advanced_filters: true,
          embedding_generation: true
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get search statistics',
      error: error.message
    });
  }
});

// Health check for search functionality
router.get('/health', async (req, res) => {
  try {
    // Test search with a simple query
    const testResults = await searchHotels('hotel', { topK: 1 });
    
    res.json({
      success: true,
      message: 'Search system is healthy',
      data: {
        search_available: true,
        embeddings_available: true,
        test_query_results: testResults.total_found
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search health check error:', error);
    res.status(503).json({
      success: false,
      message: 'Search system is experiencing issues',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;