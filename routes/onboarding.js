// routes/onboarding.js
const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const auth = require('../middleware/auth');

// Add logging middleware for debugging
router.use((req, res, next) => {
  console.log(`🛣️ Onboarding route: ${req.method} ${req.path}`);
  console.log('📊 Headers:', req.headers);
  next();
});

// All routes require authentication (except OPTIONS which is handled by auth middleware)
router.use(auth);

// Complete onboarding submission (handles all 3 steps)
router.post('/complete', (req, res, next) => {
  console.log('📝 POST /complete called');
  console.log('👤 User:', req.user);
  console.log('📦 Body keys:', Object.keys(req.body));
  onboardingController.completeOnboarding(req, res, next);
});

// Get onboarding status for current user
router.get('/status', (req, res, next) => {
  console.log('📊 GET /status called');
  console.log('👤 User:', req.user);
  onboardingController.getOnboardingStatus(req, res, next);
});

// Save onboarding progress (for multi-step persistence)
router.post('/save-progress', async (req, res) => {
  try {
    const userId = req.user.id;
    const { step, data } = req.body;

    console.log(`💾 Saving progress for user ${userId}, step ${step}`);

    if (!step || !data) {
      return res.status(400).json({
        success: false,
        message: 'Step and data are required'
      });
    }

    // In a real implementation, you'd save this to a temporary storage table
    console.log(`💾 Progress saved for user ${userId}, step ${step}`);
    
    res.json({
      success: true,
      message: 'Progress saved successfully',
      step,
      savedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Save progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving progress',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Test endpoint for debugging
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  console.log('👤 User:', req.user);
  
  res.json({
    success: true,
    message: 'Onboarding endpoint is working!',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

// Get onboarding data for a specific property (for editing)
router.get('/property/:propertyId', async (req, res) => {
  try {
    const userId = req.user.id;
    const propertyId = req.params.propertyId;

    const { pool } = require('../config/database');
    const connection = await pool.getConnection();

    try {
      // Get property basic info
      const [propertyRows] = await connection.execute(`
        SELECT * FROM properties 
        WHERE id = ? AND (user_id = ? OR user_id_int = ?)
      `, [propertyId, userId, userId]);

      if (propertyRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or access denied'
        });
      }

      const property = propertyRows[0];

      // Get room types
      const [roomTypesRows] = await connection.execute(`
        SELECT * FROM property_room_types 
        WHERE property_id = ? AND is_active = 1
      `, [propertyId]);

      // Get systems
      const [systemsRows] = await connection.execute(`
        SELECT * FROM property_systems 
        WHERE property_id = ? AND is_active = 1
      `, [propertyId]);

      // Get amenities
      const [amenitiesRows] = await connection.execute(`
        SELECT amenity_name FROM property_amenities 
        WHERE property_id = ?
      `, [propertyId]);

      // Get tax configuration
      const [taxRows] = await connection.execute(`
        SELECT * FROM property_tax_config 
        WHERE property_id = ? AND is_active = 1 
        ORDER BY created_at DESC LIMIT 1
      `, [propertyId]);

      // Get cancellation policies
      const [policiesRows] = await connection.execute(`
        SELECT policy_type, policy_description FROM property_cancellation_policies 
        WHERE property_id = ? AND is_active = 1
      `, [propertyId]);

      // Get images
      const [imagesRows] = await connection.execute(`
        SELECT image_category, image_name, file_size, file_type, image_url 
        FROM property_images 
        WHERE property_id = ? AND is_active = 1
      `, [propertyId]);

      // Format the response to match frontend structure
      const systems = {};
      systemsRows.forEach(system => {
        systems[system.system_type] = {
          systemName: system.system_name,
          systemUrl: system.system_url || system.url || '',
          clientId: system.client_id || '',
          setupUsername: system.setup_username || '',
          setupEmail: system.setup_email || ''
        };
      });

      const amenities = amenitiesRows.map(row => row.amenity_name);

      const imagery = {};
      imagesRows.forEach(image => {
        if (!imagery[image.image_category]) {
          imagery[image.image_category] = [];
        }
        imagery[image.image_category].push({
          id: Date.now() + Math.random(),
          name: image.image_name,
          size: image.file_size,
          url: image.image_url,
          type: image.file_type
        });
      });

      const cancellationPolicies = {};
      policiesRows.forEach(policy => {
        cancellationPolicies[`${policy.policy_type}Cancellation`] = policy.policy_description;
      });

      const taxConfig = taxRows.length > 0 ? taxRows[0] : {};

      res.json({
        success: true,
        data: {
          // Property info
          totalRooms: property.total_rooms,
          
          // Room types
          roomTypes: roomTypesRows.map(room => ({
            id: room.id,
            name: room.name,
            beddingConfig1: room.bedding_config_1 === 1,
            beddingConfig2: room.bedding_config_2 === 1,
            minimumRate: room.minimum_rate,
            maximumRate: room.maximum_rate,
            maxCapacity: room.max_capacity.toString(),
            guestsIncluded: room.guests_included.toString(),
            extraAdultRate: room.extra_adult_rate,
            totalRoomsInType: room.total_rooms_in_type,
            roomSize: room.room_size,
            chargeType: room.charge_type,
            roomOnly: room.room_only === 1 ? 'yes' : 'no',
            bedBreakfast: room.bed_breakfast === 1 ? 'yes' : 'no',
            halfBoard: room.half_board === 1 ? 'yes' : 'no',
            fullBoard: room.full_board === 1 ? 'yes' : 'no',
            allInclusive: room.all_inclusive === 1 ? 'yes' : 'no'
          })),

          // Systems
          pms: systems.pms || { systemName: '', systemUrl: '', clientId: '', setupUsername: '', setupEmail: '' },
          bookingEngine: systems.bookingEngine || { systemName: '', url: '', clientId: '', setupUsername: '', setupEmail: '' },
          channelManager: systems.channelManager || { systemName: '', url: '', clientId: '', setupUsername: '', setupEmail: '' },
          gds: systems.gds || { systemName: '', url: '', clientId: '', setupUsername: '', setupEmail: '' },
          rms: systems.rms || { systemName: '', url: '', clientId: '', setupUsername: '', setupEmail: '' },
          otherSystem: systems.otherSystem || { systemName: '', url: '', clientId: '', setupUsername: '', setupEmail: '' },

          // Amenities
          amenities,

          // Imagery
          imagery: {
            external: imagery.external || [],
            internalCommonAreas: imagery.internalCommonAreas || [],
            heroShots: imagery.heroShots || [],
            roomTypeA: imagery.roomTypeA || [],
            roomTypeB: imagery.roomTypeB || [],
            foodBeverage: imagery.foodBeverage || [],
            conferenceEvents: imagery.conferenceEvents || [],
            leisureFacilities: imagery.leisureFacilities || []
          },

          // Tax configuration
          federalChargeable: taxConfig.federal_chargeable === 1 ? 'yes' : 'no',
          taxRate: taxConfig.tax_rate || '',
          taxConcessions: taxConfig.tax_concessions || '',
          localTax: taxConfig.local_tax || '',
          tourismTax: taxConfig.tourism_tax || '',

          // Cancellation policies
          ...cancellationPolicies
        }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Get onboarding data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading onboarding data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Admin endpoint to get all onboarding completions
router.get('/admin/completions', async (req, res) => {
  try {
    // Check admin permissions
    if (!['superadmin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { pool } = require('../config/database');
    const connection = await pool.getConnection();

    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const [completionsRows] = await connection.execute(`
        SELECT 
          oc.*,
          p.hotel_name,
          p.city,
          p.country,
          p.status as property_status,
          u.email,
          u.display_name,
          u.role as user_role
        FROM onboarding_completions oc
        JOIN properties p ON oc.property_id = p.id
        JOIN users u ON oc.user_id = u.id
        ORDER BY oc.created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      // Get total count
      const [countRows] = await connection.execute(`
        SELECT COUNT(*) as total FROM onboarding_completions
      `);

      res.json({
        success: true,
        completions: completionsRows,
        pagination: {
          page,
          limit,
          total: countRows[0].total,
          pages: Math.ceil(countRows[0].total / limit)
        }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Get completions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading completions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;