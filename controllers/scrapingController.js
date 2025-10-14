// controllers/scrapingController.js - PDF Generation Controller
const WebScraperService = require('../services/webScraperService');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

const getReportsDir = () => path.join(__dirname, '../public/reports');

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
  
  try {
    require('playwright');
    checks.playwrightInstalled = true;
  } catch (error) {
    checks.playwrightInstalled = false;
  }
  
  await fs.ensureDir(checks.reportsDir);
  console.log('✅ Environment check completed');
  
  return checks;
}

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
  
  console.log(`✅ Processed ${files.length} PDF reports`);
  return { files };
}

async function uploadToOpenAI(files) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  console.log('🤖 Uploading files to OpenAI...');
  const uploadResults = [];
  
  for (const file of files) {
    try {
      console.log(`📤 Uploading ${file.source}: ${file.pdf.filename}`);
      
      // Upload PDF directly to OpenAI
      const formData = new FormData();
      formData.append('file', fs.createReadStream(file.pdf.filepath));
      formData.append('purpose', 'assistants');
      
      const response = await axios.post('https://api.openai.com/v1/files', formData, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        timeout: 60000
      });
      
      uploadResults.push({
        source: file.source,
        filename: file.pdf.filename,
        openai_file_id: response.data.id,
        status: 'success',
        fileType: 'PDF'
      });
      
      console.log(`✅ Successfully uploaded ${file.source} PDF to OpenAI`);
      
    } catch (error) {
      console.error(`❌ Failed to upload ${file.source}:`, error.message);
      uploadResults.push({
        source: file.source,
        filename: file.pdf.filename,
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

// Main scraping endpoint
async function scrapeUrls(req, res) {
  console.log('\n🚀 === PDF SCRAPING REQUEST STARTED ===');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🔐 User:', req.user?.uid || 'Unknown');
  
  const scraperService = new WebScraperService();
  let scrapingResult = null;
  
  try {
    const { urls, uploadToAI } = req.body;
    
    if (!urls || typeof urls !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: urls object required'
      });
    }

    console.log('\n🔧 Step 1: Environment Check');
    const envCheck = await performEnvironmentCheck();
    
    console.log('\n🌐 Step 2: Initialize Web Scraper');
    const initSuccess = await scraperService.initialize();
    if (!initSuccess) {
      throw new Error('Scraper initialization failed');
    }
    
    console.log('\n📊 Step 3: Perform Web Scraping to PDF');
    scrapingResult = await scraperService.scrapeAllReports();
    console.log('✅ PDF scraping completed');
    
    console.log('\n⚙️ Step 4: Process Scraping Results');
    const processedResult = await processScrapingResults(scrapingResult);
    
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
    
    const response = {
      success: true,
      message: 'PDF scraping completed successfully',
      data: {
        summary: {
          successful: scrapingResult.summary.successCount,
          totalProcessed: scrapingResult.summary.totalSources,
          pdfFilesGenerated: processedResult.files.length,
          screenshotsGenerated: processedResult.files.length,
          filesUploadedToAI: openAIResult ? openAIResult.successfulUploads : 0
        },
        results: processedResult.files.map(file => ({
          reportType: file.source,
          success: true,
          scraped: {
            source: file.source,
            extractedAt: file.timestamp,
            format: 'PDF + Screenshot'
          },
          pdfFile: {
            success: true,
            filename: file.pdf.filename,
            size: file.pdf.size,
            format: 'PDF'
          },
          screenshot: {
            success: true,
            filename: file.screenshot.filename,
            size: file.screenshot.size,
            format: 'PNG'
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
    console.error('\n❌ === PDF SCRAPING ERROR ===');
    console.error('Error:', error.message);
    
    res.status(500).json({
      success: false,
      message: `Internal server error during PDF scraping: ${error.message}`,
      error: {
        message: error.message,
        type: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    });
    
  } finally {
    try {
      if (scraperService) {
        await scraperService.cleanup();
      }
    } catch (cleanupError) {
      console.error('⚠️ Cleanup error:', cleanupError.message);
    }
  }
}

// Test URL endpoint
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
    
    const browser = scraperService.browser;
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const title = await page.title();
    await page.waitForTimeout(3000);
    
    await page.close();
    await scraperService.cleanup();
    
    res.json({
      success: true,
      message: `Successfully accessed ${reportType} URL - Ready for PDF generation`,
      data: {
        title,
        url,
        format: 'PDF + Screenshot',
        readyForCapture: true
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

// Get system status
async function getStatus(req, res) {
  try {
    const envCheck = await performEnvironmentCheck();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      outputFormat: 'PDF + Screenshot',
      scraper: {
        playwrightInstalled: envCheck.playwrightInstalled,
        openaiConfigured: envCheck.openaiConfigured,
        outputFormat: 'PDF documents with PNG screenshots',
        pdfSupport: true
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

// Get generated files
async function getFiles(req, res) {
  try {
    const reportsDir = getReportsDir();
    await fs.ensureDir(reportsDir);
    
    const files = await fs.readdir(reportsDir);
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));
    const screenshotFiles = files.filter(file => file.endsWith('.png'));
    
    const fileDetails = await Promise.all(
      pdfFiles.map(async (filename) => {
        const filepath = path.join(reportsDir, filename);
        const stats = await fs.stat(filepath);
        
        // Find matching screenshot
        const screenshotName = filename.replace('.pdf', '.png');
        const hasScreenshot = screenshotFiles.includes(screenshotName);
        
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          format: 'PDF',
          type: 'report',
          screenshot: hasScreenshot ? screenshotName : null
        };
      })
    );
    
    fileDetails.sort((a, b) => b.created - a.created);
    
    res.json({
      success: true,
      files: fileDetails,
      count: fileDetails.length,
      format: 'PDF',
      totalScreenshots: screenshotFiles.length
    });
    
  } catch (error) {
    console.error('❌ Failed to get PDF files:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Upload file to OpenAI
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
        error: 'PDF file not found'
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
      timeout: 60000
    });
    
    res.json({
      success: true,
      message: `Successfully uploaded ${filename} to OpenAI`,
      data: {
        fileId: response.data.id,
        filename: response.data.filename,
        bytes: response.data.bytes,
        purpose: response.data.purpose,
        format: 'PDF'
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

// Download file endpoint
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
    
    // Set proper content type
    if (filename.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (filename.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
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

// Health check endpoint
async function healthCheck(req, res) {
  res.json({
    status: 'healthy',
    service: 'web-scraping-pdf',
    outputFormat: 'PDF + Screenshot',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      openAIConfigured: !!process.env.OPENAI_API_KEY
    }
  });
}

module.exports = {
  scrapeUrls,
  testUrl,
  getStatus,
  getFiles,
  uploadFileToOpenAI,
  downloadFile,
  healthCheck
};