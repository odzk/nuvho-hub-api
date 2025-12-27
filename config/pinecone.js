// config/pinecone.js
const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize Pinecone client
let pineconeClient = null;
let pineconeIndex = null;

const initializePinecone = async () => {
  try {
    // Check if required environment variables exist
    if (!process.env.PINECONE_API_KEY) {
      console.log('⚠️ Pinecone API key not found in environment variables');
      return false;
    }

    // Initialize Pinecone client
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log('✅ Pinecone client initialized successfully');

    // Get the index
    const indexName = process.env.PINECONE_INDEX_NAME || 'hotel-embeddings';
    
    try {
      pineconeIndex = pineconeClient.index(indexName);
      console.log(`✅ Connected to Pinecone index: ${indexName}`);
      
      // Test the connection with a simple describe operation
      const indexStats = await pineconeIndex.describeIndexStats();
      console.log('📊 Index stats:', {
        totalVectorCount: indexStats.totalVectorCount,
        dimension: indexStats.dimension
      });
      
      return true;
    } catch (indexError) {
      console.log(`⚠️ Index '${indexName}' not found or not accessible`);
      console.log('💡 You may need to create the index in Pinecone console');
      console.log('💡 Suggested index configuration:');
      console.log('   - Name:', indexName);
      console.log('   - Dimension: 1536 (for OpenAI text-embedding-3-small)');
      console.log('   - Metric: cosine');
      console.log('   - Cloud: AWS');
      console.log('   - Region: us-east-1');
      return false;
    }

  } catch (error) {
    console.error('❌ Failed to initialize Pinecone:', error.message);
    return false;
  }
};

// Test Pinecone connection
const testPineconeConnection = async () => {
  try {
    if (!pineconeIndex) {
      throw new Error('Pinecone not initialized');
    }

    // Test with a simple query
    const testQuery = await pineconeIndex.query({
      vector: new Array(1536).fill(0.1), // Dummy vector for testing
      topK: 1,
      includeValues: false,
      includeMetadata: false
    });

    console.log('✅ Pinecone connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Pinecone connection test failed:', error.message);
    return false;
  }
};

// Get Pinecone client instance
const getPineconeClient = () => {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized. Call initializePinecone() first.');
  }
  return pineconeClient;
};

// Get Pinecone index instance
const getPineconeIndex = () => {
  if (!pineconeIndex) {
    throw new Error('Pinecone index not initialized. Call initializePinecone() first.');
  }
  return pineconeIndex;
};

// Upsert vectors to Pinecone
const upsertVectors = async (vectors) => {
  try {
    if (!pineconeIndex) {
      throw new Error('Pinecone index not initialized');
    }

    const response = await pineconeIndex.upsert(vectors);
    console.log(`✅ Successfully upserted ${vectors.length} vectors to Pinecone`);
    return response;
  } catch (error) {
    console.error('❌ Error upserting vectors:', error.message);
    throw error;
  }
};

// Query vectors from Pinecone
const queryVectors = async (queryVector, options = {}) => {
  try {
    if (!pineconeIndex) {
      throw new Error('Pinecone index not initialized');
    }

    const {
      topK = 10,
      filter = {},
      includeValues = false,
      includeMetadata = true,
      namespace = ''
    } = options;

    const response = await pineconeIndex.query({
      vector: queryVector,
      topK,
      filter,
      includeValues,
      includeMetadata,
      namespace
    });

    return response.matches || [];
  } catch (error) {
    console.error('❌ Error querying vectors:', error.message);
    throw error;
  }
};

// Delete vectors from Pinecone
const deleteVectors = async (ids, namespace = '') => {
  try {
    if (!pineconeIndex) {
      throw new Error('Pinecone index not initialized');
    }

    const response = await pineconeIndex.deleteMany(ids, namespace);
    console.log(`✅ Successfully deleted vectors with IDs: ${ids.join(', ')}`);
    return response;
  } catch (error) {
    console.error('❌ Error deleting vectors:', error.message);
    throw error;
  }
};

// Get index statistics
const getIndexStats = async () => {
  try {
    if (!pineconeIndex) {
      throw new Error('Pinecone index not initialized');
    }

    const stats = await pineconeIndex.describeIndexStats();
    return stats;
  } catch (error) {
    console.error('❌ Error getting index stats:', error.message);
    throw error;
  }
};

module.exports = {
  initializePinecone,
  testPineconeConnection,
  getPineconeClient,
  getPineconeIndex,
  upsertVectors,
  queryVectors,
  deleteVectors,
  getIndexStats
};