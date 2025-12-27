// controllers/propertyController.js
const Property = require('../models/Property');

// Create a new property (onboarding)
exports.createProperty = async (req, res) => {
  try {
    const userId = req.user.id;
    const propertyData = req.body;
    
    // Validate required fields
    const requiredFields = [
      'hotelName', 'category', 'type', 'streetAddress', 
      'city', 'postcode', 'country', 'phone', 'totalRooms',
      'contactName', 'contactEmail'
    ];
    
    const missingFields = requiredFields.filter(field => !propertyData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields',
        missingFields
      });
    }
    
    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(propertyData.contactEmail)) {
      return res.status(400).json({
        message: 'Invalid contact email format'
      });
    }
    
    if (propertyData.reservationEmail && !emailRegex.test(propertyData.reservationEmail)) {
      return res.status(400).json({
        message: 'Invalid reservation email format'
      });
    }
    
    // Validate website URL if provided
    if (propertyData.websiteUrl && !propertyData.websiteUrl.match(/^https?:\/\/.+/)) {
      return res.status(400).json({
        message: 'Website URL must include http:// or https://'
      });
    }
    
    // Validate total rooms
    const totalRooms = parseInt(propertyData.totalRooms);
    if (isNaN(totalRooms) || totalRooms < 1) {
      return res.status(400).json({
        message: 'Total rooms must be a valid number greater than 0'
      });
    }
    
    // Create the property
    const property = await Property.create(propertyData, userId);
    
    res.status(201).json({
      message: 'Property created successfully',
      property
    });
    
  } catch (error) {
    console.error('Create property error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'A property with similar details already exists'
      });
    }
    
    res.status(500).json({
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
      properties,
      count: properties.length
    });
    
  } catch (error) {
    console.error('Get user properties error:', error);
    res.status(500).json({
      message: 'Server error while fetching properties'
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
        message: 'Property not found'
      });
    }
    
    // Check if user owns the property (unless they're admin)
    if (property.userId !== userId && req.user.role !== 'superadmin') {
      return res.status(403).json({
        message: 'Access denied'
      });
    }
    
    res.json({ property });
    
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({
      message: 'Server error while fetching property'
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
        message: 'Invalid contact email format'
      });
    }
    
    if (propertyData.reservationEmail && !emailRegex.test(propertyData.reservationEmail)) {
      return res.status(400).json({
        message: 'Invalid reservation email format'
      });
    }
    
    // Validate website URL if provided
    if (propertyData.websiteUrl && !propertyData.websiteUrl.match(/^https?:\/\/.+/)) {
      return res.status(400).json({
        message: 'Website URL must include http:// or https://'
      });
    }
    
    // Validate total rooms if provided
    if (propertyData.totalRooms) {
      const totalRooms = parseInt(propertyData.totalRooms);
      if (isNaN(totalRooms) || totalRooms < 1) {
        return res.status(400).json({
          message: 'Total rooms must be a valid number greater than 0'
        });
      }
    }
    
    const property = await Property.update(propertyId, propertyData, userId);
    
    res.json({
      message: 'Property updated successfully',
      property
    });
    
  } catch (error) {
    console.error('Update property error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      message: 'Server error while updating property'
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
      message: 'Property deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete property error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      message: 'Server error while deleting property'
    });
  }
};

// Get all properties (admin only)
exports.getAllProperties = async (req, res) => {
  try {
    // Check admin permissions
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({
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
    
    const properties = await Property.getAll(limit, offset, filters);
    
    res.json({
      properties,
      count: properties.length,
      page,
      limit,
      filters
    });
    
  } catch (error) {
    console.error('Get all properties error:', error);
    res.status(500).json({
      message: 'Server error while fetching properties'
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
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }
    
    // Determine if user should be checked (only for non-admin users)
    const checkUserId = (req.user.role !== 'superadmin' && req.user.role !== 'admin') ? userId : null;
    
    const property = await Property.updateStatus(propertyId, status, checkUserId);
    
    res.json({
      message: 'Property status updated successfully',
      property
    });
    
  } catch (error) {
    console.error('Update property status error:', error);
    
    if (error.message === 'Property not found or access denied') {
      return res.status(404).json({
        message: 'Property not found or access denied'
      });
    }
    
    res.status(500).json({
      message: 'Server error while updating property status'
    });
  }
};

// Get property statistics (admin only)
exports.getPropertyStats = async (req, res) => {
  try {
    // Check admin permissions
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({
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
      
      // Get recent properties
      const [recentRows] = await connection.execute(`
        SELECT hotel_name, city, country, created_at, status
        FROM properties 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      res.json({
        stats: statsRows[0],
        byCategory: categoryRows,
        byCountry: countryRows,
        recent: recentRows
      });
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Get property stats error:', error);
    res.status(500).json({
      message: 'Server error while fetching property statistics'
    });
  }
};