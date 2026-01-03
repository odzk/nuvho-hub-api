// controllers/propertyController.js
const Property = require('../models/Property');

// Create a new property (onboarding from signup form)
exports.createProperty = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      // Hotel Information
      hotelName,
      websiteUrl,
      category, // coStarClassification
      type, // propertyType
      
      // Address Information
      streetAddress,
      suburb,
      city,
      state, // New field from signup form
      postcode,
      country,
      
      // Contact & Additional Info
      currency, // New field from signup form
      contactName,
      contactEmail,
      phone = '',
      fax = '',
      totalRooms = 0,
      corporateEntity = '',
      ownershipBreakdown = '',
      reservationEmail = '',
      latitude = null,
      longitude = null,
      status = 'pending',
      
      // Additional fields that might come from signup
      ...otherData
    } = req.body;

    console.log('🏨 Creating property for user:', userId, '- Hotel:', hotelName);
    
    // Validate required fields from signup form
    const requiredFields = [
      'hotelName', 'city', 'state', 'postcode', 'country', 
      'contactName', 'contactEmail'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }
    
    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(contactEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact email format'
      });
    }
    
    if (reservationEmail && !emailRegex.test(reservationEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation email format'
      });
    }
    
    // Validate and normalize website URL
    let normalizedWebsiteUrl = websiteUrl;
    if (websiteUrl && !websiteUrl.match(/^https?:\/\//)) {
      normalizedWebsiteUrl = `https://${websiteUrl}`;
    }
    
    // Validate total rooms if provided
    if (totalRooms) {
      const rooms = parseInt(totalRooms);
      if (isNaN(rooms) || rooms < 0) {
        return res.status(400).json({
          success: false,
          message: 'Total rooms must be a valid number greater than or equal to 0'
        });
      }
    }
    
    // Prepare property data with all signup form fields
    const propertyData = {
      hotelName,
      websiteUrl: normalizedWebsiteUrl,
      category,
      type,
      streetAddress,
      suburb,
      city,
      state, // Include state field
      postcode,
      country,
      phone,
      fax,
      totalRooms: parseInt(totalRooms) || 0,
      latitude,
      longitude,
      contactName,
      contactEmail,
      reservationEmail: reservationEmail || contactEmail,
      corporateEntity,
      ownershipBreakdown,
      currency, // Include currency field
      status,
      ...otherData // Include any additional fields
    };
    
    // Create the property using your existing model
    const property = await Property.create(propertyData, userId);
    
    console.log('✅ Property created successfully:', property.id || 'new property');
    
    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      property,
      propertyId: property.id
    });
    
  } catch (error) {
    console.error('❌ Create property error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A property with similar details already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get user's properties
exports.getUserProperties = async (req, res) => {
  try {
    const userId = req.user.id;
    const properties = await Property.findByUserId(userId);
    
    res.json({
      success: true,
      properties,
      count: properties.length
    });
    
  } catch (error) {
    console.error('❌ Get user properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching properties',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get specific property by ID
exports.getProperty = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userId = req.user.id;
    
    const property = await Property.findById(propertyId);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Check if user owns the property (unless they're admin)
    if (property.userId !== userId && !['superadmin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({ 
      success: true,
      property 
    });
    
  } catch (error) {
    console.error('❌ Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Update property
exports.updateProperty = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userId = req.user.id;
    const propertyData = req.body;
    
    // Validate email formats if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (propertyData.contactEmail && !emailRegex.test(propertyData.contactEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact email format'
      });
    }
    
    if (propertyData.reservationEmail && !emailRegex.test(propertyData.reservationEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reservation email format'
      });
    }
    
    // Validate and normalize website URL if provided
    if (propertyData.websiteUrl && !propertyData.websiteUrl.match(/^https?:\/\//)) {
      propertyData.websiteUrl = `https://${propertyData.websiteUrl}`;
    }
    
    // Validate total rooms if provided
    if (propertyData.totalRooms) {
      const totalRooms = parseInt(propertyData.totalRooms);
      if (isNaN(totalRooms) || totalRooms < 0) {
        return res.status(400).json({
          success: false,
          message: 'Total rooms must be a valid number greater than or equal to 0'
        });
      }
    }
    
    const property = await Property.update(propertyId, propertyData, userId);
    
    res.json({
      success: true,
      message: 'Property updated successfully',
      property
    });
    
  } catch (error) {
    console.error('❌ Update property error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        success: false,
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Delete property
exports.deleteProperty = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userId = req.user.id;
    
    await Property.delete(propertyId, userId);
    
    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Delete property error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        success: false,
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while deleting property',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get all properties (admin only)
exports.getAllProperties = async (req, res) => {
  try {
    // Check admin permissions
    if (!['superadmin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const filters = {};
    if (req.query.country) filters.country = req.query.country;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.state) filters.state = req.query.state; // New filter for state
    if (req.query.currency) filters.currency = req.query.currency; // New filter for currency
    
    const properties = await Property.getAll(limit, offset, filters);
    
    res.json({
      success: true,
      properties,
      count: properties.length,
      page,
      limit,
      filters
    });
    
  } catch (error) {
    console.error('❌ Get all properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching properties',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Update property status (admin or owner)
exports.updatePropertyStatus = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const { status } = req.body;
    const userId = req.user.id;
    
    // Validate status
    const validStatuses = ['pending', 'active', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }
    
    // Determine if user should be checked (only for non-admin users)
    const checkUserId = (!['superadmin', 'admin'].includes(req.user.role)) ? userId : null;
    
    const property = await Property.updateStatus(propertyId, status, checkUserId);
    
    res.json({
      success: true,
      message: 'Property status updated successfully',
      property
    });
    
  } catch (error) {
    console.error('❌ Update property status error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        success: false,
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating property status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get property statistics (admin only)
exports.getPropertyStats = async (req, res) => {
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
      // Get basic statistics
      const [statsRows] = await connection.execute(`
        SELECT 
          COUNT(*) as total_properties,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_properties,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_properties,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_properties,
          AVG(total_rooms) as avg_rooms,
          SUM(total_rooms) as total_rooms_all
        FROM properties
      `);
      
      // Get properties by category
      const [categoryRows] = await connection.execute(`
        SELECT category, COUNT(*) as count 
        FROM properties 
        WHERE category IS NOT NULL
        GROUP BY category 
        ORDER BY count DESC
      `);
      
      // Get properties by country
      const [countryRows] = await connection.execute(`
        SELECT country, COUNT(*) as count 
        FROM properties 
        GROUP BY country 
        ORDER BY count DESC 
        LIMIT 10
      `);

      // Get properties by state/province (new)
      const [stateRows] = await connection.execute(`
        SELECT state, country, COUNT(*) as count 
        FROM properties 
        WHERE state IS NOT NULL
        GROUP BY state, country 
        ORDER BY count DESC 
        LIMIT 10
      `);

      // Get properties by currency (new)
      const [currencyRows] = await connection.execute(`
        SELECT currency, COUNT(*) as count 
        FROM properties 
        WHERE currency IS NOT NULL
        GROUP BY currency 
        ORDER BY count DESC
      `);
      
      // Get recent properties
      const [recentRows] = await connection.execute(`
        SELECT hotel_name, city, state, country, created_at, status
        FROM properties 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      res.json({
        success: true,
        stats: statsRows[0],
        byCategory: categoryRows,
        byCountry: countryRows,
        byState: stateRows,
        byCurrency: currencyRows,
        recent: recentRows
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Get property stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching property statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};