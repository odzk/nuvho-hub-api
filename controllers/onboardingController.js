// controllers/onboardingController.js
const Property = require('../models/Property');

// Complete onboarding submission (handles all 3 steps)
exports.completeOnboarding = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      property,
      roomTypes = [],
      systems = {},
      amenities = [],
      imagery = {},
      taxConfiguration = {},
      cancellationPolicies = {},
      completedAt,
      source = 'onboarding-flow'
    } = req.body;

    console.log('🎯 Processing complete onboarding for user:', userId);

    // Validate required property data
    if (!property || !property.contactName || !property.contactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Property contact information is required'
      });
    }

    // Start database transaction
    const { pool } = require('../config/database');
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Create the main property
      const propertyData = {
        ...property,
        totalRooms: roomTypes.reduce((total, room) => total + (parseInt(room.totalRoomsInType) || 0), 0)
      };

      const createdProperty = await Property.create(propertyData, userId);
      const propertyId = createdProperty.id;

      console.log('✅ Property created with ID:', propertyId);

      // 2. Save room types
      if (roomTypes.length > 0) {
        await this.saveRoomTypes(connection, propertyId, roomTypes);
        console.log('✅ Room types saved:', roomTypes.length);
      }

      // 3. Save systems information
      await this.saveSystemsInfo(connection, propertyId, systems);
      console.log('✅ Systems information saved');

      // 4. Save amenities
      if (amenities.length > 0) {
        await this.saveAmenities(connection, propertyId, amenities);
        console.log('✅ Amenities saved:', amenities.length);
      }

      // 5. Save tax configuration
      await this.saveTaxConfiguration(connection, propertyId, taxConfiguration);
      console.log('✅ Tax configuration saved');

      // 6. Save cancellation policies
      await this.saveCancellationPolicies(connection, propertyId, cancellationPolicies);
      console.log('✅ Cancellation policies saved');

      // 7. Save imagery metadata (actual file upload would be separate)
      await this.saveImageryMetadata(connection, propertyId, imagery);
      console.log('✅ Imagery metadata saved');

      // 8. Create onboarding completion record
      await this.saveOnboardingCompletion(connection, userId, propertyId, {
        roomTypesCount: roomTypes.length,
        amenitiesCount: amenities.length,
        systemsConfigured: Object.keys(systems).filter(key => systems[key]?.systemName).length,
        imagesUploaded: Object.values(imagery).reduce((total, category) => total + category.length, 0),
        completedAt: completedAt || new Date().toISOString(),
        source
      });

      await connection.commit();
      console.log('🎉 Onboarding completed successfully');

      // Return comprehensive response
      res.status(201).json({
        success: true,
        message: 'Onboarding completed successfully',
        data: {
          propertyId: propertyId,
          property: createdProperty,
          summary: {
            roomTypes: roomTypes.length,
            amenities: amenities.length,
            systemsConfigured: Object.keys(systems).filter(key => systems[key]?.systemName).length,
            totalRooms: propertyData.totalRooms,
            imagesUploaded: Object.values(imagery).reduce((total, category) => total + category.length, 0)
          }
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Complete onboarding error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error during onboarding completion',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Save room types to database
exports.saveRoomTypes = async (connection, propertyId, roomTypes) => {
  const insertRoomTypeQuery = `
    INSERT INTO property_room_types (
      property_id, name, bedding_config_1, bedding_config_2,
      minimum_rate, maximum_rate, max_capacity, guests_included,
      extra_adult_rate, total_rooms_in_type, room_size, charge_type,
      room_only, bed_breakfast, half_board, full_board, all_inclusive,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  for (const room of roomTypes) {
    const values = [
      propertyId,
      room.name || '',
      room.beddingConfig1 ? 1 : 0,
      room.beddingConfig2 ? 1 : 0,
      parseFloat(room.minimumRate) || 0,
      parseFloat(room.maximumRate) || 0,
      parseInt(room.maxCapacity) || 2,
      parseInt(room.guestsIncluded) || 2,
      parseFloat(room.extraAdultRate) || 0,
      parseInt(room.totalRoomsInType) || 1,
      parseFloat(room.roomSize) || 0,
      room.chargeType || 'per room',
      room.mealPlans?.roomOnly ? 1 : 0,
      room.mealPlans?.bedBreakfast ? 1 : 0,
      room.mealPlans?.halfBoard ? 1 : 0,
      room.mealPlans?.fullBoard ? 1 : 0,
      room.mealPlans?.allInclusive ? 1 : 0
    ];

    await connection.execute(insertRoomTypeQuery, values);
  }
};

// Save systems information
exports.saveSystemsInfo = async (connection, propertyId, systems) => {
  const insertSystemQuery = `
    INSERT INTO property_systems (
      property_id, system_type, system_name, system_url, 
      client_id, setup_username, setup_email, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const systemTypes = ['pms', 'bookingEngine', 'channelManager', 'gds', 'rms', 'otherSystem'];
  
  for (const systemType of systemTypes) {
    const system = systems[systemType];
    if (system?.systemName) {
      const values = [
        propertyId,
        systemType,
        system.systemName,
        system.systemUrl || system.url || '',
        system.clientId || '',
        system.setupUsername || '',
        system.setupEmail || ''
      ];

      await connection.execute(insertSystemQuery, values);
    }
  }
};

// Save amenities
exports.saveAmenities = async (connection, propertyId, amenities) => {
  const insertAmenityQuery = `
    INSERT INTO property_amenities (property_id, amenity_name, amenity_type, created_at) 
    VALUES (?, ?, 'standard', NOW())
  `;

  for (const amenity of amenities) {
    await connection.execute(insertAmenityQuery, [propertyId, amenity]);
  }
};

// Save tax configuration
exports.saveTaxConfiguration = async (connection, propertyId, taxConfig) => {
  const insertTaxQuery = `
    INSERT INTO property_tax_config (
      property_id, federal_chargeable, tax_rate, tax_concessions,
      local_tax, tourism_tax, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [
    propertyId,
    taxConfig.federalChargeable ? 1 : 0,
    parseFloat(taxConfig.taxRate) || 0,
    taxConfig.taxConcessions || '',
    parseFloat(taxConfig.localTax) || 0,
    parseFloat(taxConfig.tourismTax) || 0
  ];

  await connection.execute(insertTaxQuery, values);
};

// Save cancellation policies
exports.saveCancellationPolicies = async (connection, propertyId, policies) => {
  if (!policies.public && !policies.corporate && !policies.group) return;

  const insertPolicyQuery = `
    INSERT INTO property_cancellation_policies (
      property_id, policy_type, policy_description, created_at
    ) VALUES (?, ?, ?, NOW())
  `;

  if (policies.public) {
    await connection.execute(insertPolicyQuery, [propertyId, 'public', policies.public]);
  }
  if (policies.corporate) {
    await connection.execute(insertPolicyQuery, [propertyId, 'corporate', policies.corporate]);
  }
  if (policies.group) {
    await connection.execute(insertPolicyQuery, [propertyId, 'group', policies.group]);
  }
};

// Save imagery metadata
exports.saveImageryMetadata = async (connection, propertyId, imagery) => {
  const insertImageQuery = `
    INSERT INTO property_images (
      property_id, image_category, image_name, file_size, 
      file_type, upload_status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', NOW())
  `;

  for (const [category, images] of Object.entries(imagery)) {
    for (const image of images) {
      const values = [
        propertyId,
        category,
        image.name,
        image.size || 0,
        image.type || 'image/jpeg'
      ];

      await connection.execute(insertImageQuery, values);
    }
  }
};

// Save onboarding completion record
exports.saveOnboardingCompletion = async (connection, userId, propertyId, metadata) => {
  const insertCompletionQuery = `
    INSERT INTO onboarding_completions (
      user_id, property_id, room_types_count, amenities_count,
      systems_configured, images_uploaded, completed_at, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [
    userId,
    propertyId,
    metadata.roomTypesCount || 0,
    metadata.amenitiesCount || 0,
    metadata.systemsConfigured || 0,
    metadata.imagesUploaded || 0,
    metadata.completedAt,
    metadata.source
  ];

  await connection.execute(insertCompletionQuery, values);
};

// Get onboarding status
exports.getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const { pool } = require('../config/database');
    const connection = await pool.getConnection();

    try {
      // Check if user has completed onboarding
      const [completionRows] = await connection.execute(`
        SELECT oc.*, p.hotel_name, p.status as property_status
        FROM onboarding_completions oc
        JOIN properties p ON oc.property_id = p.id
        WHERE oc.user_id = ?
        ORDER BY oc.created_at DESC
        LIMIT 1
      `, [userId]);

      if (completionRows.length > 0) {
        const completion = completionRows[0];
        res.json({
          success: true,
          completed: true,
          completion: {
            propertyId: completion.property_id,
            hotelName: completion.hotel_name,
            propertyStatus: completion.property_status,
            completedAt: completion.completed_at,
            summary: {
              roomTypes: completion.room_types_count,
              amenities: completion.amenities_count,
              systemsConfigured: completion.systems_configured,
              imagesUploaded: completion.images_uploaded
            }
          }
        });
      } else {
        res.json({
          success: true,
          completed: false,
          message: 'Onboarding not completed'
        });
      }

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Get onboarding status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking onboarding status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = exports;