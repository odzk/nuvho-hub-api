// models/Property.js
const { pool } = require('../config/database');

class Property {
  // Create a new property
  static async create(propertyData, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Insert main property data
      const insertPropertyQuery = `
        INSERT INTO properties (
          user_id, corporate_entity, hotel_name, category, type, 
          street_address, city, postcode, suburb, country, 
          phone, fax, total_rooms, latitude, longitude, 
          contact_name, contact_email, reservation_email, 
          website_url, ownership_breakdown, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `;
      
      const propertyValues = [
        userId,
        propertyData.corporateEntity || null,
        propertyData.hotelName,
        propertyData.category,
        propertyData.type,
        propertyData.streetAddress,
        propertyData.city,
        propertyData.postcode,
        propertyData.suburb || null,
        propertyData.country,
        propertyData.phone,
        propertyData.fax || null,
        parseInt(propertyData.totalRooms),
        propertyData.latitude ? parseFloat(propertyData.latitude) : null,
        propertyData.longitude ? parseFloat(propertyData.longitude) : null,
        propertyData.contactName,
        propertyData.contactEmail,
        propertyData.reservationEmail || null,
        propertyData.websiteUrl || null,
        propertyData.ownershipBreakdown || null
      ];
      
      const [propertyResult] = await connection.execute(insertPropertyQuery, propertyValues);
      const propertyId = propertyResult.insertId;
      
      // Insert primary contact
      const insertContactQuery = `
        INSERT INTO property_contacts (
          property_id, contact_type, name, email, phone, title
        ) VALUES (?, 'primary', ?, ?, ?, 'Main Contact')
      `;
      
      await connection.execute(insertContactQuery, [
        propertyId,
        propertyData.contactName,
        propertyData.contactEmail,
        propertyData.phone
      ]);
      
      // Insert reservation contact if different
      if (propertyData.reservationEmail && propertyData.reservationEmail !== propertyData.contactEmail) {
        const insertReservationContactQuery = `
          INSERT INTO property_contacts (
            property_id, contact_type, name, email, title
          ) VALUES (?, 'reservation', ?, ?, 'Reservation Contact')
        `;
        
        await connection.execute(insertReservationContactQuery, [
          propertyId,
          propertyData.contactName,
          propertyData.reservationEmail
        ]);
      }
      
      await connection.commit();
      
      // Return the created property with ID
      return {
        id: propertyId,
        ...propertyData,
        userId,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('Error creating property:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Get property by ID
  static async findById(propertyId) {
    const connection = await pool.getConnection();
    
    try {
      const query = `
        SELECT 
          p.*,
          GROUP_CONCAT(
            CONCAT(pc.contact_type, ':', pc.name, ':', pc.email, ':', IFNULL(pc.phone, ''))
            SEPARATOR '|'
          ) as contacts
        FROM properties p
        LEFT JOIN property_contacts pc ON p.id = pc.property_id AND pc.is_active = TRUE
        WHERE p.id = ?
        GROUP BY p.id
      `;
      
      const [rows] = await connection.execute(query, [propertyId]);
      
      if (rows.length === 0) {
        return null;
      }
      
      const property = this.formatPropertyData(rows[0]);
      return property;
      
    } catch (error) {
      console.error('Error finding property by ID:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Get properties by user ID
  static async findByUserId(userId) {
    const connection = await pool.getConnection();
    
    try {
      const query = `
        SELECT 
          p.*,
          GROUP_CONCAT(
            CONCAT(pc.contact_type, ':', pc.name, ':', pc.email, ':', IFNULL(pc.phone, ''))
            SEPARATOR '|'
          ) as contacts
        FROM properties p
        LEFT JOIN property_contacts pc ON p.id = pc.property_id AND pc.is_active = TRUE
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `;
      
      const [rows] = await connection.execute(query, [userId]);
      
      return rows.map(row => this.formatPropertyData(row));
      
    } catch (error) {
      console.error('Error finding properties by user ID:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Update property
  static async update(propertyId, propertyData, userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Update main property data
      const updateQuery = `
        UPDATE properties SET
          corporate_entity = ?, hotel_name = ?, category = ?, type = ?,
          street_address = ?, city = ?, postcode = ?, suburb = ?, country = ?,
          phone = ?, fax = ?, total_rooms = ?, latitude = ?, longitude = ?,
          contact_name = ?, contact_email = ?, reservation_email = ?,
          website_url = ?, ownership_breakdown = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `;
      
      const updateValues = [
        propertyData.corporateEntity || null,
        propertyData.hotelName,
        propertyData.category,
        propertyData.type,
        propertyData.streetAddress,
        propertyData.city,
        propertyData.postcode,
        propertyData.suburb || null,
        propertyData.country,
        propertyData.phone,
        propertyData.fax || null,
        parseInt(propertyData.totalRooms),
        propertyData.latitude ? parseFloat(propertyData.latitude) : null,
        propertyData.longitude ? parseFloat(propertyData.longitude) : null,
        propertyData.contactName,
        propertyData.contactEmail,
        propertyData.reservationEmail || null,
        propertyData.websiteUrl || null,
        propertyData.ownershipBreakdown || null,
        propertyId,
        userId
      ];
      
      const [result] = await connection.execute(updateQuery, updateValues);
      
      if (result.affectedRows === 0) {
        throw new Error('Property not found or access denied');
      }
      
      await connection.commit();
      
      // Return updated property
      return await this.findById(propertyId);
      
    } catch (error) {
      await connection.rollback();
      console.error('Error updating property:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Delete property
  static async delete(propertyId, userId) {
    const connection = await pool.getConnection();
    
    try {
      const deleteQuery = 'DELETE FROM properties WHERE id = ? AND user_id = ?';
      const [result] = await connection.execute(deleteQuery, [propertyId, userId]);
      
      if (result.affectedRows === 0) {
        throw new Error('Property not found or access denied');
      }
      
      return { message: 'Property deleted successfully' };
      
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Get all properties (admin function)
  static async getAll(limit = 50, offset = 0, filters = {}) {
    const connection = await pool.getConnection();
    
    try {
      let query = `
        SELECT 
          p.*,
          GROUP_CONCAT(
            CONCAT(pc.contact_type, ':', pc.name, ':', pc.email, ':', IFNULL(pc.phone, ''))
            SEPARATOR '|'
          ) as contacts
        FROM properties p
        LEFT JOIN property_contacts pc ON p.id = pc.property_id AND pc.is_active = TRUE
      `;
      
      const queryParams = [];
      const whereConditions = [];
      
      // Add filters
      if (filters.country) {
        whereConditions.push('p.country = ?');
        queryParams.push(filters.country);
      }
      
      if (filters.category) {
        whereConditions.push('p.category = ?');
        queryParams.push(filters.category);
      }
      
      if (filters.type) {
        whereConditions.push('p.type = ?');
        queryParams.push(filters.type);
      }
      
      if (filters.status) {
        whereConditions.push('p.status = ?');
        queryParams.push(filters.status);
      }
      
      if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
      }
      
      query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(limit, offset);
      
      const [rows] = await connection.execute(query, queryParams);
      
      return rows.map(row => this.formatPropertyData(row));
      
    } catch (error) {
      console.error('Error getting all properties:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Update property status
  static async updateStatus(propertyId, status, userId = null) {
    const connection = await pool.getConnection();
    
    try {
      let query = 'UPDATE properties SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      let params = [status, propertyId];
      
      // If userId is provided, ensure user owns the property
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      const [result] = await connection.execute(query, params);
      
      if (result.affectedRows === 0) {
        throw new Error('Property not found or access denied');
      }
      
      return await this.findById(propertyId);
      
    } catch (error) {
      console.error('Error updating property status:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Helper method to format property data
  static formatPropertyData(row) {
    const property = {
      id: row.id,
      userId: row.user_id,
      corporateEntity: row.corporate_entity,
      hotelName: row.hotel_name,
      category: row.category,
      type: row.type,
      streetAddress: row.street_address,
      city: row.city,
      postcode: row.postcode,
      suburb: row.suburb,
      country: row.country,
      phone: row.phone,
      fax: row.fax,
      totalRooms: row.total_rooms,
      latitude: row.latitude,
      longitude: row.longitude,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      reservationEmail: row.reservation_email,
      websiteUrl: row.website_url,
      ownershipBreakdown: row.ownership_breakdown,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contacts: []
    };
    
    // Parse contacts if available
    if (row.contacts) {
      const contactStrings = row.contacts.split('|');
      property.contacts = contactStrings.map(contactStr => {
        const [type, name, email, phone] = contactStr.split(':');
        return {
          type,
          name,
          email,
          phone: phone || null
        };
      });
    }
    
    return property;
  }
}

module.exports = Property;