// services/webScraperService.js - PDF Generation with Playwright
const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

class WebScraperService {
  constructor() {
    this.browser = null;
    this.reportsDir = path.join(__dirname, '../public/reports');
    console.log('🔧 Web scraper initialized for PDF generation');
    console.log('📁 Reports directory:', this.reportsDir);
  }

  async initialize() {
    try {
      console.log('🚀 Starting browser initialization...');
      
      await this.ensureReportsDirectory();
      
      console.log('🌐 Launching Chromium browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      console.log('✅ Browser launched successfully');
      return true;
    } catch (error) {
      console.error('❌ Browser initialization failed:', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      throw new Error(`Browser initialization failed: ${error.message}`);
    }
  }

  async ensureReportsDirectory() {
    try {
      console.log('📁 Checking reports directory...');
      await fs.ensureDir(this.reportsDir);
      
      const testFile = path.join(this.reportsDir, 'test.txt');
      await fs.writeFile(testFile, 'test');
      await fs.remove(testFile);
      
      console.log('✅ Reports directory ready and writable');
    } catch (error) {
      console.error('❌ Reports directory setup failed:', error.message);
      throw new Error(`Reports directory setup failed: ${error.message}`);
    }
  }

  async scrapeAllReports() {
    const reports = {
      powerbi: null,
      pipedrive: null,
      looker: null
    };

    const results = {
      success: [],
      failures: []
    };

    try {
      console.log('🏁 Starting comprehensive scraping process...');
      
      if (!this.browser) {
        throw new Error('Browser not initialized. Call initialize() first.');
      }

      // Power BI Report
      try {
        console.log('📊 Scraping Power BI report...');
        reports.powerbi = await this.scrapePowerBI();
        results.success.push('powerbi');
        console.log('✅ Power BI scraping completed');
      } catch (error) {
        console.error('❌ Power BI scraping failed:', error.message);
        results.failures.push({ source: 'powerbi', error: error.message });
      }

      // Pipedrive Report
      try {
        console.log('📈 Scraping Pipedrive report...');
        reports.pipedrive = await this.scrapePipedrive();
        results.success.push('pipedrive');
        console.log('✅ Pipedrive scraping completed');
      } catch (error) {
        console.error('❌ Pipedrive scraping failed:', error.message);
        results.failures.push({ source: 'pipedrive', error: error.message });
      }

      // Looker Studio Report
      try {
        console.log('📉 Scraping Looker Studio report...');
        reports.looker = await this.scrapeLookerStudio();
        results.success.push('looker');
        console.log('✅ Looker Studio scraping completed');
      } catch (error) {
        console.error('❌ Looker Studio scraping failed:', error.message);
        results.failures.push({ source: 'looker', error: error.message });
      }

      const summary = {
        timestamp: new Date().toISOString(),
        totalSources: 3,
        successCount: results.success.length,
        failureCount: results.failures.length,
        successfulSources: results.success,
        failedSources: results.failures.map(f => f.source),
        reports: Object.keys(reports).filter(key => reports[key] !== null),
        errors: results.failures
      };

      console.log('📋 Scraping Summary:', JSON.stringify(summary, null, 2));

      return {
        reports,
        summary,
        success: results.success.length > 0
      };

    } catch (error) {
      console.error('❌ Critical scraping error:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async scrapePowerBI() {
    const page = await this.browser.newPage();
    
    try {
      console.log('🔗 Navigating to Power BI URL...');
      const url = 'https://app.powerbi.com/view?r=eyJrIjoiZTRmNGMyNDItMjE3ZC00NmEwLWFjYjctZTExNjUzNGRjZTFlIiwidCI6IjE1NzIzNDEzLWNiNWQtNDUzYy1iYjcyLTNmNDgxMjQxYWVmZiJ9';
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      console.log('⏳ Waiting for Power BI content to load...');
      // Wait longer for Power BI to fully render
      await page.waitForTimeout(8000);
      
      // Set viewport for better capture
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const timestamp = Date.now();
      const baseFilename = `powerbi_report_${timestamp}`;
      
      // Generate PDF
      console.log('📄 Generating PDF...');
      const pdfFilename = `${baseFilename}.pdf`;
      const pdfPath = path.join(this.reportsDir, pdfFilename);
      
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      const pdfStats = await fs.stat(pdfPath);
      console.log(`💾 PDF saved: ${pdfFilename} (${(pdfStats.size / 1024).toFixed(1)} KB)`);
      
      // Also take a screenshot for preview
      console.log('📸 Taking screenshot...');
      const screenshotFilename = `${baseFilename}.png`;
      const screenshotPath = path.join(this.reportsDir, screenshotFilename);
      
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      
      const screenshotStats = await fs.stat(screenshotPath);
      console.log(`🖼️ Screenshot saved: ${screenshotFilename} (${(screenshotStats.size / 1024).toFixed(1)} KB)`);
      
      return {
        pdf: {
          filename: pdfFilename,
          filepath: pdfPath,
          size: pdfStats.size
        },
        screenshot: {
          filename: screenshotFilename,
          filepath: screenshotPath,
          size: screenshotStats.size
        },
        source: url,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Power BI scraping error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  async scrapePipedrive() {
    const page = await this.browser.newPage();
    
    try {
      console.log('🔗 Navigating to Pipedrive URL...');
      const url = 'https://nuvho.pipedrive.com/share/be72785687bfe28b9be176c6f679e6ddd0c5352c7af5cf690b6a4dc6a0e43c51';
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      console.log('⏳ Waiting for Pipedrive content to load...');
      await page.waitForTimeout(5000);
      
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const timestamp = Date.now();
      const baseFilename = `pipedrive_report_${timestamp}`;
      
      // Generate PDF
      console.log('📄 Generating PDF...');
      const pdfFilename = `${baseFilename}.pdf`;
      const pdfPath = path.join(this.reportsDir, pdfFilename);
      
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      const pdfStats = await fs.stat(pdfPath);
      console.log(`💾 PDF saved: ${pdfFilename} (${(pdfStats.size / 1024).toFixed(1)} KB)`);
      
      // Screenshot
      console.log('📸 Taking screenshot...');
      const screenshotFilename = `${baseFilename}.png`;
      const screenshotPath = path.join(this.reportsDir, screenshotFilename);
      
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      
      const screenshotStats = await fs.stat(screenshotPath);
      console.log(`🖼️ Screenshot saved: ${screenshotFilename}`);
      
      return {
        pdf: {
          filename: pdfFilename,
          filepath: pdfPath,
          size: pdfStats.size
        },
        screenshot: {
          filename: screenshotFilename,
          filepath: screenshotPath,
          size: screenshotStats.size
        },
        source: url,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Pipedrive scraping error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  async scrapeLookerStudio() {
    const page = await this.browser.newPage();
    
    try {
      console.log('🔗 Navigating to Looker Studio URL...');
      const url = 'https://lookerstudio.google.com/embed/reporting/79629ba9-1330-4b0e-aff9-720777237d92/page/p_kvluly5zoc';
      
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      console.log('⏳ Waiting for Looker Studio content to load...');
      await page.waitForTimeout(8000);
      
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const timestamp = Date.now();
      const baseFilename = `looker_studio_report_${timestamp}`;
      
      // Generate PDF
      console.log('📄 Generating PDF...');
      const pdfFilename = `${baseFilename}.pdf`;
      const pdfPath = path.join(this.reportsDir, pdfFilename);
      
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        },
        scale: 0.9 // Slightly smaller scale for better fit
      });
      
      const pdfStats = await fs.stat(pdfPath);
      console.log(`💾 PDF saved: ${pdfFilename} (${(pdfStats.size / 1024).toFixed(1)} KB)`);
      
      // Screenshot
      console.log('📸 Taking screenshot...');
      const screenshotFilename = `${baseFilename}.png`;
      const screenshotPath = path.join(this.reportsDir, screenshotFilename);
      
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      
      const screenshotStats = await fs.stat(screenshotPath);
      console.log(`🖼️ Screenshot saved: ${screenshotFilename}`);
      
      return {
        pdf: {
          filename: pdfFilename,
          filepath: pdfPath,
          size: pdfStats.size
        },
        screenshot: {
          filename: screenshotFilename,
          filepath: screenshotPath,
          size: screenshotStats.size
        },
        source: url,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Looker Studio scraping error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        console.log('🧹 Closing browser...');
        await this.browser.close();
        this.browser = null;
        console.log('✅ Browser closed successfully');
      }
    } catch (error) {
      console.error('❌ Browser cleanup error:', error.message);
    }
  }
}

module.exports = WebScraperService;