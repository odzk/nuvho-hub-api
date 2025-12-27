// scripts/setupEmbeddings.js
const dotenv = require('dotenv');
dotenv.config();

const { initializePinecone, testPineconeConnection } = require('../config/pinecone');
const { initializeOpenAI, generateAllHotelEmbeddings } = require('../services/embeddingService');
const { testConnection } = require('../config/database');

const setupEmbeddings = async () => {
  try {
    console.log('🚀 Starting Nuvho HotelCRM AI Setup...\n');
    
    // Step 1: Test database connection
    console.log('📊 Step 1: Testing MySQL connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    console.log('✅ MySQL connection successful\n');
    
    // Step 2: Initialize OpenAI
    console.log('🤖 Step 2: Initializing OpenAI client...');
    const openaiEnabled = initializeOpenAI();
    if (!openaiEnabled) {
      throw new Error('OpenAI initialization failed. Please check OPENAI_API_KEY in .env');
    }
    console.log('✅ OpenAI client initialized\n');
    
    // Step 3: Initialize Pinecone
    console.log('🔧 Step 3: Initializing Pinecone...');
    const pineconeEnabled = await initializePinecone();
    if (!pineconeEnabled) {
      console.log('❌ Pinecone initialization failed');
      console.log('\n📋 Pinecone Setup Instructions:');
      console.log('1. Go to https://app.pinecone.io/');
      console.log('2. Create a new index with these settings:');
      console.log('   - Name: hotel-embeddings');
      console.log('   - Dimension: 1536');
      console.log('   - Metric: cosine');
      console.log('   - Cloud: AWS');
      console.log('   - Region: us-east-1');
      console.log('3. Update your .env file with the correct PINECONE_API_KEY and PINECONE_HOST');
      throw new Error('Pinecone setup required');
    }
    console.log('✅ Pinecone initialized successfully\n');
    
    // Step 4: Test Pinecone connection
    console.log('🔍 Step 4: Testing Pinecone connection...');
    const pineconeConnected = await testPineconeConnection();
    if (!pineconeConnected) {
      throw new Error('Pinecone connection test failed');
    }
    console.log('✅ Pinecone connection test passed\n');
    
    // Step 5: Generate embeddings for all hotels
    console.log('🏨 Step 5: Generating embeddings for all hotels...');
    console.log('⚠️  This may take several minutes depending on the number of hotels');
    console.log('💡 The process will respect API rate limits\n');
    
    const result = await generateAllHotelEmbeddings();
    
    console.log(`\n🎉 Setup completed successfully!`);
    console.log(`📊 Results:`);
    console.log(`   - Hotels processed: ${result.processed}/${result.total}`);
    console.log(`   - Success rate: ${((result.processed / result.total) * 100).toFixed(1)}%`);
    
    console.log('\n🚀 Your AI-powered hotel search is now ready!');
    console.log('📋 Available features:');
    console.log('   - Semantic hotel search');
    console.log('   - Find similar hotels');
    console.log('   - Advanced filtering');
    console.log('   - Real-time embedding generation');
    
    console.log('\n📡 API Endpoints:');
    console.log('   - POST /api/search/hotels');
    console.log('   - GET /api/search/hotels/:id/similar');
    console.log('   - POST /api/search/hotels/advanced');
    console.log('   - GET /api/search/stats');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    
    if (error.message.includes('OpenAI')) {
      console.log('\n💡 OpenAI Setup Help:');
      console.log('1. Get your API key from https://platform.openai.com/api-keys');
      console.log('2. Add OPENAI_API_KEY=your_key_here to your .env file');
    }
    
    if (error.message.includes('Database')) {
      console.log('\n💡 Database Setup Help:');
      console.log('1. Ensure your MySQL server is running');
      console.log('2. Check your database credentials in .env file');
      console.log('3. Ensure the database user has proper permissions');
    }
    
    if (error.message.includes('Pinecone')) {
      console.log('\n💡 Pinecone Setup Help:');
      console.log('1. Verify your API key is correct');
      console.log('2. Ensure the index exists and is ready');
      console.log('3. Check the host URL matches your region');
    }
    
    process.exit(1);
  }
};

// Add some helpful command line options
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Nuvho HotelCRM AI Setup Script');
  console.log('');
  console.log('This script will:');
  console.log('1. Test database connection');
  console.log('2. Initialize OpenAI client');
  console.log('3. Initialize Pinecone vector database');
  console.log('4. Generate embeddings for all existing hotels');
  console.log('');
  console.log('Prerequisites:');
  console.log('- Valid OPENAI_API_KEY in .env');
  console.log('- Valid PINECONE_API_KEY in .env');
  console.log('- Pinecone index created (hotel-embeddings, dimension: 1536)');
  console.log('- MySQL database accessible');
  console.log('');
  console.log('Usage:');
  console.log('  npm run setup:embeddings');
  console.log('  node scripts/setupEmbeddings.js');
  console.log('');
  process.exit(0);
}

if (args.includes('--check') || args.includes('-c')) {
  // Just run checks without generating embeddings
  console.log('🔍 Running configuration checks only...\n');
  
  console.log('Environment Variables:');
  console.log('  OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('  PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('  PINECONE_HOST:', process.env.PINECONE_HOST ? '✅ Set' : '❌ Missing');
  console.log('  DB_HOST:', process.env.DB_HOST ? '✅ Set' : '❌ Missing');
  console.log('  DB_USER:', process.env.DB_USER ? '✅ Set' : '❌ Missing');
  console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Missing');
  console.log('  DB_NAME:', process.env.DB_NAME ? '✅ Set' : '❌ Missing');
  
  process.exit(0);
}

// Run the setup
setupEmbeddings();