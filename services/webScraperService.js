// services/webScraperService.js - Enhanced with detailed logging
const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

class WebScraperService {
  constructor() {
    this.browser = null;
    this.reportsDir = path.join(__dirname, '../public/reports');
    console.log('🔧 WebScraperService initialized');
    console.log('📁 Reports directory:', this.reportsDir);
  }

  async initialize() {
    try {
      console.log('🚀 Starting browser initialization...');
      
      // Ensure reports directory exists
      await this.ensureReportsDirectory();
      
      // Launch browser with detailed logging
      console.log('🌐 Launching Chromium browser...');
      this.browser = await chromium.launch({
        headless: true, // Set to false for debugging
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
      
      // Test write permissions
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

      // Generate summary
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
        success: results.success.length > 0 // At least one successful scrape
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
      
      // Wait for Power BI to load
      await page.waitForTimeout(5000);
      
      // Look for data elements (adjust selectors based on actual Power BI structure)
      const data = await page.evaluate(() => {
        // This is a placeholder - you'll need to inspect the actual Power BI page
        // to find the correct selectors for data extraction
        const elements = document.querySelectorAll('[data-testid], .visual-content, .card-content');
        return Array.from(elements).slice(0, 10).map(el => ({
          text: el.textContent?.trim() || '',
          className: el.className,
          tag: el.tagName
        })).filter(item => item.text.length > 0);
      });

      const csvContent = this.convertToCSV(data, 'PowerBI');
      const filename = `powerbi_report_${Date.now()}.csv`;
      const filepath = path.join(this.reportsDir, filename);
      
      await fs.writeFile(filepath, csvContent);
      console.log(`💾 Power BI data saved to: ${filename}`);
      
      return { filename, filepath, rowCount: data.length };
      
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
      await page.waitForTimeout(3000);
      
      // Extract Pipedrive data
      const data = await page.evaluate(() => {
        // Adjust selectors based on Pipedrive's actual structure
        const rows = document.querySelectorAll('tr, .deal-row, .pipeline-item, .report-row');
        return Array.from(rows).slice(0, 20).map((row, index) => ({
          rowIndex: index,
          text: row.textContent?.trim() || '',
          cells: Array.from(row.querySelectorAll('td, .cell, .value')).map(cell => 
            cell.textContent?.trim() || ''
          )
        })).filter(item => item.text.length > 0);
      });

      const csvContent = this.convertToCSV(data, 'Pipedrive');
      const filename = `pipedrive_report_${Date.now()}.csv`;
      const filepath = path.join(this.reportsDir, filename);
      
      await fs.writeFile(filepath, csvContent);
      console.log(`💾 Pipedrive data saved to: ${filename}`);
      
      return { filename, filepath, rowCount: data.length };
      
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
      await page.waitForTimeout(5000);
      
      // Extract Looker Studio data
      const data = await page.evaluate(() => {
        // Adjust selectors based on Looker Studio's structure
        const charts = document.querySelectorAll('[data-chart], .chart-container, .visualization');
        const tables = document.querySelectorAll('table, .data-table, .report-table');
        
        const chartData = Array.from(charts).map((chart, index) => ({
          type: 'chart',
          index,
          content: chart.textContent?.trim() || ''
        }));
        
        const tableData = Array.from(tables).map((table, index) => ({
          type: 'table',
          index,
          content: table.textContent?.trim() || ''
        }));
        
        return [...chartData, ...tableData].filter(item => item.content.length > 0);
      });

      const csvContent = this.convertToCSV(data, 'LookerStudio');
      const filename = `looker_studio_report_${Date.now()}.csv`;
      const filepath = path.join(this.reportsDir, filename);
      
      await fs.writeFile(filepath, csvContent);
      console.log(`💾 Looker Studio data saved to: ${filename}`);
      
      return { filename, filepath, rowCount: data.length };
      
    } catch (error) {
      console.error('❌ Looker Studio scraping error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  convertToCSV(data, source) {
    if (!data || data.length === 0) {
      return `Source,Message\n${source},"No data found"`;
    }

    const headers = ['Source', 'Index', 'Content', 'Type', 'Timestamp'];
    const timestamp = new Date().toISOString();
    
    const rows = data.map((item, index) => {
      const content = (typeof item === 'object' ? 
        (item.text || item.content || JSON.stringify(item)) : 
        String(item)
      ).replace(/"/g, '""'); // Escape quotes for CSV
      
      return `"${source}","${index}","${content}","${typeof item}","${timestamp}"`;
    });

    return [headers.join(','), ...rows].join('\n');
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