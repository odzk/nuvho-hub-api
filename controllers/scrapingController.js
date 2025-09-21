// controllers/scrapingController.js - Complete implementation matching frontend API
const WebScraperService = require('../services/webScraperService');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

// Helper function to get reports directory
const getReportsDir = () => path.join(__dirname, '../public/reports');

// Environment check function
async function performEnvironmentCheck() {
  console.log('🔧 Checking environment...');
  
  const checks = {
    nodeVersion: process.version,
    platform: process.platform,
    memory: process.memoryUsage(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    reportsDir: getReportsDir(),
    playwrightInstalled: false
  };
  
  // Check if Playwright is installed
  try {
    require('playwright');
    checks.playwrightInstalled = true;
  } catch (error) {
    checks.playwrightInstalled = false;
  }
  
  console.log('Environment checks:', JSON.stringify(checks, null, 2));
  
  // Ensure reports directory exists
  await fs.ensureDir(checks.reportsDir);
  console.log('✅ Environment check completed');
  
  return checks;
}

// Process scraping results
async function processScrapingResults(scrapingResult) {
  console.log('⚙️ Processing scraping results...');
  
  const files = [];
  
  if (scrapingResult.reports.powerbi) {
    files.push({
      source: 'powerbi',
      ...scrapingResult.reports.powerbi
    });
  }
  
  if (scrapingResult.reports.pipedrive) {
    files.push({
      source: 'pipedrive',
      ...scrapingResult.reports.pipedrive
    });
  }
  
  if (scrapingResult.reports.looker) {
    files.push({
      source: 'looker',
      ...scrapingResult.reports.looker
    });
  }
  
  console.log(`✅ Processed ${files.length} files`);
  return { files };
}

// Upload to OpenAI function
async function uploadToOpenAI(files) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  console.log('🤖 Uploading files to OpenAI...');
  const uploadResults = [];
  
  for (const file of files) {
    try {
      console.log(`📤 Uploading ${file.source} file: ${file.filename}`);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(file.filepath));
      formData.append('purpose', 'assistants');
      
      const response = await axios.post('https://api.openai.com/v1/files', formData, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      });
      
      uploadResults.push({
        source: file.source,
        filename: file.filename,
        openai_file_id: response.data.id,
        status: 'success'
      });
      
      console.log(`✅ Successfully uploaded ${file.source} to OpenAI`);
      
    } catch (error) {
      console.error(`❌ Failed to upload ${file.source}:`, error.message);
      uploadResults.push({
        source: file.source,
        filename: file.filename,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  return {
    totalFiles: files.length,
    successfulUploads: uploadResults.filter(r => r.status === 'success').length,
    failedUploads: uploadResults.filter(r => r.status === 'failed').length,
    results: uploadResults
  };
}

// 1. Main scraping endpoint (matches frontend: /scrape-urls)
async function scrapeUrls(req, res) {
  console.log('\n🚀 === SCRAPING REQUEST STARTED ===');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🔐 User:', req.user?.uid || 'Unknown');
  console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
  
  const scraperService = new WebScraperService();
  let scrapingResult = null;
  
  try {
    // Extract URLs from request body (frontend format)
    const { urls, uploadToAI } = req.body;
    
    if (!urls || typeof urls !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: urls object required'
      });
    }

    // Step 1: Environment Check
    console.log('\n🔧 Step 1: Environment Check');
    const envCheck = await performEnvironmentCheck();
    
    // Step 2: Initialize Scraper
    console.log('\n🌐 Step 2: Initialize Web Scraper');
    const initSuccess = await scraperService.initialize();
    if (!initSuccess) {
      throw new Error('Scraper initialization failed');
    }
    console.log('✅ Scraper initialized successfully');
    
    // Step 3: Perform Scraping
    console.log('\n📊 Step 3: Perform Web Scraping');
    scrapingResult = await scraperService.scrapeAllReports();
    console.log('✅ Scraping completed');
    
    // Step 4: Process Results
    console.log('\n⚙️ Step 4: Process Scraping Results');
    const processedResult = await processScrapingResults(scrapingResult);
    
    // Step 5: Upload to OpenAI (if requested)
    console.log('\n🤖 Step 5: Upload to OpenAI Assistant');
    let openAIResult = null;
    
    if (uploadToAI && process.env.OPENAI_API_KEY) {
      try {
        openAIResult = await uploadToOpenAI(processedResult.files);
        console.log('✅ OpenAI upload completed');
      } catch (openAIError) {
        console.warn('⚠️ OpenAI upload failed:', openAIError.message);
        openAIResult = { error: openAIError.message };
      }
    }
    
    // Format response to match frontend expectations
    const response = {
      success: true,
      message: 'Scraping completed successfully',
      data: {
        summary: {
          successful: scrapingResult.summary.successCount,
          totalProcessed: scrapingResult.summary.totalSources,
          csvFilesGenerated: processedResult.files.length,
          filesUploadedToAI: openAIResult ? openAIResult.successfulUploads : 0
        },
        results: processedResult.files.map(file => ({
          reportType: file.source,
          recordCount: file.rowCount || 0,
          success: true,
          scraped: {
            source: file.source,
            extractedAt: new Date().toISOString(),
            usingSampleData: false
          },
          csvFile: {
            success: true,
            filename: file.filename,
            size: fs.statSync(file.filepath).size
          },
          openaiUpload: openAIResult ? {
            success: openAIResult.results.find(r => r.source === file.source)?.status === 'success',
            fileId: openAIResult.results.find(r => r.source === file.source)?.openai_file_id
          } : null
        }))
      }
    };
    
    console.log('🎉 Sending success response');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('\n❌ === SCRAPING ERROR ===');
    console.error('🚨 Error Type:', error.constructor.name);
    console.error('📝 Error Message:', error.message);
    console.error('📚 Error Stack:', error.stack);
    
    const errorResponse = {
      success: false,
      message: `Internal server error during scraping: ${error.message}`,
      error: {
        message: error.message,
        type: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('💥 Sending error response:', JSON.stringify(errorResponse, null, 2));
    res.status(500).json(errorResponse);
    
  } finally {
    try {
      if (scraperService) {
        await scraperService.cleanup();
        console.log('🧹 Cleanup completed');
      }
    } catch (cleanupError) {
      console.error('⚠️ Cleanup error:', cleanupError.message);
    }
  }
}

// 2. Test URL endpoint (matches frontend: /test-url)
async function testUrl(req, res) {
  console.log('\n🧪 === URL TEST STARTED ===');
  
  const { url, reportType } = req.body;
  
  if (!url || !reportType) {
    return res.status(400).json({
      success: false,
      message: 'URL and reportType are required'
    });
  }
  
  const scraperService = new WebScraperService();
  
  try {
    await scraperService.initialize();
    
    // Simple test - just try to navigate to the URL
    const browser = scraperService.browser;
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const title = await page.title();
    
    await page.close();
    await scraperService.cleanup();
    
    res.json({
      success: true,
      message: `Successfully accessed ${reportType} URL`,
      recordCount: 1,
      data: {
        title,
        usingSampleData: false,
        url
      }
    });
    
  } catch (error) {
    console.error('❌ URL test failed:', error.message);
    
    await scraperService.cleanup();
    
    res.json({
      success: false,
      message: `Failed to access ${reportType}: ${error.message}`
    });
  }
}

// 3. Get system status (matches frontend: /status)
async function getStatus(req, res) {
  try {
    const envCheck = await performEnvironmentCheck();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      scraper: {
        playwrightInstalled: envCheck.playwrightInstalled,
        openaiConfigured: envCheck.openaiConfigured
      },
      environment: envCheck
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 4. Get generated files (matches frontend: /files)
async function getFiles(req, res) {
  try {
    const reportsDir = getReportsDir();
    await fs.ensureDir(reportsDir);
    
    const files = await fs.readdir(reportsDir);
    const csvFiles = files.filter(file => file.endsWith('.csv'));
    
    const fileDetails = await Promise.all(
      csvFiles.map(async (filename) => {
        const filepath = path.join(reportsDir, filename);
        const stats = await fs.stat(filepath);
        
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );
    
    // Sort by creation date, newest first
    fileDetails.sort((a, b) => b.created - a.created);
    
    res.json({
      success: true,
      files: fileDetails,
      count: fileDetails.length
    });
    
  } catch (error) {
    console.error('❌ Failed to get files:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 5. Upload file to OpenAI (matches frontend: /upload-to-openai)
async function uploadFileToOpenAI(req, res) {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Filename is required'
      });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }
    
    const filepath = path.join(getReportsDir(), filename);
    
    if (!await fs.pathExists(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filepath));
    formData.append('purpose', 'assistants');
    
    const response = await axios.post('https://api.openai.com/v1/files', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 30000
    });
    
    res.json({
      success: true,
      message: `Successfully uploaded ${filename} to OpenAI`,
      data: {
        fileId: response.data.id,
        filename: response.data.filename,
        bytes: response.data.bytes,
        purpose: response.data.purpose
      }
    });
    
  } catch (error) {
    console.error('❌ OpenAI upload failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 6. Download file endpoint
async function downloadFile(req, res) {
  try {
    const { filename } = req.params;
    const filepath = path.join(getReportsDir(), filename);
    
    if (!await fs.pathExists(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    res.download(filepath, filename);
    
  } catch (error) {
    console.error('❌ File download failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 7. Health check endpoint
async function healthCheck(req, res) {
  res.json({
    status: 'healthy',
    service: 'web-scraping',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      openAIConfigured: !!process.env.OPENAI_API_KEY
    }
  });
}

module.exports = {
  scrapeUrls,         // POST /scrape-urls
  testUrl,           // POST /test-url  
  getStatus,         // GET /status
  getFiles,          // GET /files
  uploadFileToOpenAI, // POST /upload-to-openai
  downloadFile,      // GET /download/:filename
  healthCheck        // GET /health
};