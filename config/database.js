// config/database.js
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: '129.212.248.108',
  user: 'thc_admin',
  password: 'vah0HCB-nug_eyw_wzp',
  database: 'the_hotel_collective',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  reconnect: true,
  acquireTimeout: 60000,
  timeout: 60000,
  charset: 'utf8mb4'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log(`📍 Connected to: ${dbConfig.host}/${dbConfig.database}`);
    
    // Test query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Database test query successful');
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Initialize database and tables
const initializeDatabase = async () => {
  try {
    // Create connection without database first
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port || 3306
    });
    
    // Create database if it doesn't exist
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${dbConfig.database}' ensured`);
    await tempConnection.end();
    
    // Now use pool connection with database
    const connection = await pool.getConnection();
    
    // Create properties table
    const createPropertiesTable = `
      CREATE TABLE IF NOT EXISTS properties (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        corporate_entity TEXT,
        hotel_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        type VARCHAR(100) NOT NULL,
        street_address TEXT NOT NULL,
        city VARCHAR(255) NOT NULL,
        postcode VARCHAR(20) NOT NULL,
        suburb VARCHAR(255),
        country VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        fax VARCHAR(50),
        total_rooms INT NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        reservation_email VARCHAR(255),
        website_url TEXT,
        ownership_breakdown TEXT,
        status ENUM('pending', 'active', 'inactive') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_hotel_name (hotel_name),
        INDEX idx_city (city),
        INDEX idx_country (country),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(createPropertiesTable);
    console.log('✅ Properties table ensured');
    
    // Create property_amenities table for future use
    const createAmenitiesTable = `
      CREATE TABLE IF NOT EXISTS property_amenities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        amenity_name VARCHAR(255) NOT NULL,
        amenity_type VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        INDEX idx_property_id (property_id),
        INDEX idx_amenity_type (amenity_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(createAmenitiesTable);
    console.log('✅ Property amenities table ensured');
    
    // Create property_contacts table for additional contacts
    const createContactsTable = `
      CREATE TABLE IF NOT EXISTS property_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        contact_type ENUM('primary', 'reservation', 'sales', 'management', 'billing') NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        title VARCHAR(255),
        department VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        INDEX idx_property_id (property_id),
        INDEX idx_contact_type (contact_type),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await connection.execute(createContactsTable);
    console.log('✅ Property contacts table ensured');
    
    connection.release();
    console.log('🎉 Database initialization completed successfully');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (error) {
    console.error('❌ Error closing database pool:', error.message);
  }
};

module.exports = {
  pool,
  testConnection,
  initializeDatabase,
  closePool
};