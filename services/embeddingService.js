// services/embeddingService.js
const OpenAI = require('openai');
const { upsertVectors, queryVectors, deleteVectors } = require('../config/pinecone');
const { pool } = require('../config/database');

// Initialize OpenAI client
let openaiClient = null;

const initializeOpenAI = () => {
  if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI client initialized for embeddings');
    return true;
  } else {
    console.log('⚠️ OpenAI API key not found - embedding generation will be disabled');
    return false;
  }
};

// Generate embedding for text using OpenAI
const generateEmbedding = async (text, model = 'text-embedding-3-small') => {
  try {
    if (!openaiClient) {
      throw new Error('OpenAI client not initialized. Add OPENAI_API_KEY to environment variables.');
    }

    const response = await openaiClient.embeddings.create({
      model,
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('❌ Error generating embedding:', error.message);
    throw error;
  }
};

// Create searchable text from hotel property data
const createHotelSearchText = (property) => {
  const searchableFields = [
    property.hotel_name,
    property.category,
    property.type,
    property.city,
    property.country,
    property.suburb,
    property.street_address,
    property.corporate_entity,
    // Add amenities if available
    ...(property.amenities || [])
  ].filter(Boolean);

  return searchableFields.join(' ').toLowerCase();
};

// Generate and store embeddings for a hotel property
const generateHotelEmbedding = async (propertyId) => {
  try {
    // Get property data from MySQL
    const [propertyRows] = await pool.execute(
      `SELECT p.*, 
       GROUP_CONCAT(pa.amenity_name SEPARATOR ', ') as amenities
       FROM properties p 
       LEFT JOIN property_amenities pa ON p.id = pa.property_id 
       WHERE p.id = ?
       GROUP BY p.id`,
      [propertyId]
    );

    if (propertyRows.length === 0) {
      throw new Error(`Property with ID ${propertyId} not found`);
    }

    const property = propertyRows[0];
    
    // Create searchable text
    const searchText = createHotelSearchText(property);
    
    // Generate embedding
    const embedding = await generateEmbedding(searchText);
    
    // Prepare metadata for Pinecone
    const metadata = {
      hotel_id: property.id,
      hotel_name: property.hotel_name,
      city: property.city,
      country: property.country,
      category: property.category,
      type: property.type,
      total_rooms: property.total_rooms,
      status: property.status,
      latitude: property.latitude || 0,
      longitude: property.longitude || 0,
      created_at: property.created_at.toISOString(),
      updated_at: property.updated_at.toISOString()
    };

    // Store in Pinecone
    await upsertVectors([{
      id: `hotel_${property.id}`,
      values: embedding,
      metadata
    }]);

    console.log(`✅ Generated and stored embedding for hotel: ${property.hotel_name}`);
    return { propertyId, embedding, metadata };

  } catch (error) {
    console.error(`❌ Error generating hotel embedding for property ${propertyId}:`, error.message);
    throw error;
  }
};

// Batch generate embeddings for all hotels
const generateAllHotelEmbeddings = async () => {
  try {
    // Get all active properties
    const [properties] = await pool.execute(
      `SELECT p.*, 
       GROUP_CONCAT(pa.amenity_name SEPARATOR ', ') as amenities
       FROM properties p 
       LEFT JOIN property_amenities pa ON p.id = pa.property_id 
       WHERE p.status = 'active'
       GROUP BY p.id`
    );

    console.log(`🔄 Processing ${properties.length} properties for embedding generation...`);

    const results = [];
    let processed = 0;

    for (const property of properties) {
      try {
        const searchText = createHotelSearchText(property);
        const embedding = await generateEmbedding(searchText);
        
        const metadata = {
          hotel_id: property.id,
          hotel_name: property.hotel_name,
          city: property.city,
          country: property.country,
          category: property.category,
          type: property.type,
          total_rooms: property.total_rooms,
          status: property.status,
          latitude: property.latitude || 0,
          longitude: property.longitude || 0,
          created_at: property.created_at.toISOString(),
          updated_at: property.updated_at.toISOString()
        };

        results.push({
          id: `hotel_${property.id}`,
          values: embedding,
          metadata
        });

        processed++;
        console.log(`✅ Processed ${processed}/${properties.length}: ${property.hotel_name}`);

        // Batch upsert every 100 vectors to avoid memory issues
        if (results.length >= 100) {
          await upsertVectors(results);
          results.length = 0; // Clear the array
        }

        // Add small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to process property ${property.id}: ${property.hotel_name}`, error.message);
      }
    }

    // Upload remaining vectors
    if (results.length > 0) {
      await upsertVectors(results);
    }

    console.log(`🎉 Successfully processed ${processed}/${properties.length} properties`);
    return { processed, total: properties.length };

  } catch (error) {
    console.error('❌ Error in batch embedding generation:', error.message);
    throw error;
  }
};

// Search hotels using semantic similarity
const searchHotels = async (searchQuery, options = {}) => {
  try {
    const {
      topK = 10,
      filters = {},
      includeDistance = true
    } = options;

    // Generate embedding for search query
    const queryEmbedding = await generateEmbedding(searchQuery);

    // Search in Pinecone
    const searchResults = await queryVectors(queryEmbedding, {
      topK,
      filter: filters,
      includeValues: false,
      includeMetadata: true
    });

    // Enrich results with full MySQL data
    const enrichedResults = [];

    for (const match of searchResults) {
      const hotelId = match.metadata.hotel_id;
      
      // Get full hotel data from MySQL
      const [hotelRows] = await pool.execute(
        `SELECT p.*, 
         GROUP_CONCAT(pa.amenity_name SEPARATOR ', ') as amenities,
         GROUP_CONCAT(DISTINCT pc.name, ' (', pc.contact_type, ')' SEPARATOR '; ') as contacts
         FROM properties p 
         LEFT JOIN property_amenities pa ON p.id = pa.property_id 
         LEFT JOIN property_contacts pc ON p.id = pc.property_id AND pc.is_active = TRUE
         WHERE p.id = ?
         GROUP BY p.id`,
        [hotelId]
      );

      if (hotelRows.length > 0) {
        enrichedResults.push({
          ...hotelRows[0],
          similarity_score: includeDistance ? (1 - match.score) : match.score,
          search_metadata: match.metadata
        });
      }
    }

    return {
      query: searchQuery,
      results: enrichedResults,
      total_found: enrichedResults.length
    };

  } catch (error) {
    console.error('❌ Error searching hotels:', error.message);
    throw error;
  }
};

// Find similar hotels to a given hotel
const findSimilarHotels = async (hotelId, options = {}) => {
  try {
    // Get the hotel's embedding by searching for it
    const [hotelRows] = await pool.execute(
      'SELECT hotel_name, city, country FROM properties WHERE id = ?',
      [hotelId]
    );

    if (hotelRows.length === 0) {
      throw new Error(`Hotel with ID ${hotelId} not found`);
    }

    const hotel = hotelRows[0];
    const searchQuery = `${hotel.hotel_name} ${hotel.city} ${hotel.country}`;
    
    // Search for similar hotels but exclude the original hotel
    const results = await searchHotels(searchQuery, {
      ...options,
      topK: (options.topK || 10) + 1 // Get one extra to account for self-match
    });

    // Filter out the original hotel
    results.results = results.results.filter(result => result.id !== parseInt(hotelId));
    
    // Limit to requested topK
    if (options.topK) {
      results.results = results.results.slice(0, options.topK);
    }

    return {
      source_hotel: hotel,
      similar_hotels: results.results,
      total_found: results.results.length
    };

  } catch (error) {
    console.error('❌ Error finding similar hotels:', error.message);
    throw error;
  }
};

// Delete hotel embedding when hotel is deleted
const deleteHotelEmbedding = async (propertyId) => {
  try {
    await deleteVectors([`hotel_${propertyId}`]);
    console.log(`✅ Deleted embedding for hotel property ${propertyId}`);
  } catch (error) {
    console.error(`❌ Error deleting embedding for property ${propertyId}:`, error.message);
    throw error;
  }
};

module.exports = {
  initializeOpenAI,
  generateEmbedding,
  generateHotelEmbedding,
  generateAllHotelEmbeddings,
  searchHotels,
  findSimilarHotels,
  deleteHotelEmbedding,
  createHotelSearchText
};