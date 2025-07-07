const { chromium, firefox, webkit } = require('playwright');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');

class PlaywrightMCPServer extends EventEmitter {
  constructor() {
    super();
    this.name = 'playwright-mcp-server';
    this.version = '1.0.0';
    this.browsers = new Map();
    this.contexts = new Map();
    this.pages = new Map();
    this.initialized = false;
    this.supportedBrowsers = ['chromium', 'firefox', 'webkit'];
    this.defaultConfig = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000,
      viewport: { width: 1280, height: 720 }
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      logger.info('Initializing Playwright MCP Server');
      
      // Pre-install browsers if needed
      for (const browserName of this.supportedBrowsers) {
        try {
          const browser = await this.getBrowser(browserName);
          await browser.close();
          logger.info(`Browser ${browserName} validated successfully`);
        } catch (error) {
          logger.warn(`Browser ${browserName} validation failed:`, error.message);
        }
      }
      
      this.initialized = true;
      logger.info('Playwright MCP Server initialized successfully');
      
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Playwright MCP Server:', error);
      throw error;
    }
  }

  async getBrowser(browserName = 'chromium', config = {}) {
    const browserConfig = { ...this.defaultConfig, ...config };
    const cacheKey = `${browserName}_${JSON.stringify(browserConfig)}`;
    
    if (this.browsers.has(cacheKey)) {
      const browser = this.browsers.get(cacheKey);
      if (browser.isConnected()) {
        return browser;
      } else {
        this.browsers.delete(cacheKey);
      }
    }
    
    let browser;
    switch (browserName) {
      case 'chromium':
        browser = await chromium.launch(browserConfig);
        break;
      case 'firefox':
        browser = await firefox.launch(browserConfig);
        break;
      case 'webkit':
        browser = await webkit.launch(browserConfig);
        break;
      default:
        throw new Error(`Unsupported browser: ${browserName}`);
    }
    
    this.browsers.set(cacheKey, browser);
    
    browser.on('disconnected', () => {
      this.browsers.delete(cacheKey);
      logger.info(`Browser ${browserName} disconnected`);
    });
    
    return browser;
  }

  async createContext(browserName = 'chromium', contextConfig = {}) {
    const browser = await this.getBrowser(browserName);
    const context = await browser.newContext({
      viewport: this.defaultConfig.viewport,
      ...contextConfig
    });
    
    const contextId = `${browserName}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.contexts.set(contextId, context);
    
    context.on('close', () => {
      this.contexts.delete(contextId);
      logger.info(`Context ${contextId} closed`);
    });
    
    return { contextId, context };
  }

  async createPage(contextId) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    
    const page = await context.newPage();
    const pageId = `${contextId}_page_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.pages.set(pageId, page);
    
    page.on('close', () => {
      this.pages.delete(pageId);
      logger.info(`Page ${pageId} closed`);
    });
    
    return { pageId, page };
  }

  getPage(pageId) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    return page;
  }

  async processToolCall(toolName, args) {
    try {
      logger.info(`Processing MCP tool call: ${toolName}`, { args });
      
      const result = await this.handleToolCall(toolName, args);
      
      logger.info(`MCP tool call completed: ${toolName}`, { success: true });
      return {
        success: true,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`MCP tool call failed: ${toolName}`, { error: error.message, args });
      trackError(error, { toolName, args });
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async handleToolCall(toolName, args) {
    switch (toolName) {
      case 'playwright_create_context':
        return await this.createContext(args.browser, args.config);
      
      case 'playwright_create_page':
        return await this.createPage(args.contextId);
      
      case 'playwright_navigate':
        return await this.navigate(args.pageId, args.url, args.options);
      
      case 'playwright_click':
        return await this.click(args.pageId, args.selector, args.options);
      
      case 'playwright_type':
        return await this.type(args.pageId, args.selector, args.text, args.options);
      
      case 'playwright_get_text':
        return await this.getText(args.pageId, args.selector, args.options);
      
      case 'playwright_screenshot':
        return await this.screenshot(args.pageId, args.options);
      
      case 'playwright_wait_for_selector':
        return await this.waitForSelector(args.pageId, args.selector, args.options);
      
      case 'playwright_evaluate':
        return await this.evaluate(args.pageId, args.script, args.args);
      
      case 'playwright_close_page':
        return await this.closePage(args.pageId);
      
      case 'playwright_close_context':
        return await this.closeContext(args.contextId);
      
      case 'playwright_get_url':
        return await this.getUrl(args.pageId);
      
      case 'playwright_get_title':
        return await this.getTitle(args.pageId);
      
      case 'playwright_list_pages':
        return this.listPages();
      
      case 'playwright_list_contexts':
        return this.listContexts();
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async navigate(pageId, url, options = {}) {
    const page = this.getPage(pageId);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
      ...options
    });
    return { url: page.url(), title: await page.title() };
  }

  async click(pageId, selector, options = {}) {
    const page = this.getPage(pageId);
    await page.click(selector, {
      timeout: 30000,
      ...options
    });
    return { success: true };
  }

  async type(pageId, selector, text, options = {}) {
    const page = this.getPage(pageId);
    await page.fill(selector, text, {
      timeout: 30000,
      ...options
    });
    return { success: true };
  }

  async getText(pageId, selector, options = {}) {
    const page = this.getPage(pageId);
    const element = await page.locator(selector).first();
    const text = await element.textContent({
      timeout: 30000,
      ...options
    });
    return { text };
  }

  async screenshot(pageId, options = {}) {
    const page = this.getPage(pageId);
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      ...options
    });
    return { screenshot: screenshot.toString('base64') };
  }

  async waitForSelector(pageId, selector, options = {}) {
    const page = this.getPage(pageId);
    await page.waitForSelector(selector, {
      timeout: 30000,
      ...options
    });
    return { success: true };
  }

  async evaluate(pageId, script, args = []) {
    const page = this.getPage(pageId);
    const result = await page.evaluate(script, args);
    return { result };
  }

  async closePage(pageId) {
    const page = this.getPage(pageId);
    await page.close();
    this.pages.delete(pageId);
    return { success: true };
  }

  async closeContext(contextId) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    
    await context.close();
    this.contexts.delete(contextId);
    return { success: true };
  }

  async getUrl(pageId) {
    const page = this.getPage(pageId);
    return { url: page.url() };
  }

  async getTitle(pageId) {
    const page = this.getPage(pageId);
    const title = await page.title();
    return { title };
  }

  listPages() {
    return Array.from(this.pages.keys()).map(pageId => ({
      pageId,
      url: this.pages.get(pageId).url()
    }));
  }

  listContexts() {
    return Array.from(this.contexts.keys());
  }

  async getHealthStatus() {
    try {
      const activeBrowsers = Array.from(this.browsers.keys()).filter(key => 
        this.browsers.get(key).isConnected()
      );
      
      return {
        healthy: true,
        message: 'Playwright MCP Server is healthy',
        details: {
          initialized: this.initialized,
          activeBrowsers: activeBrowsers.length,
          activeContexts: this.contexts.size,
          activePages: this.pages.size,
          supportedBrowsers: this.supportedBrowsers
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: error.message,
        details: { error: error.message }
      };
    }
  }

  async cleanup() {
    logger.info('Cleaning up Playwright MCP Server');
    
    // Close all pages
    for (const [pageId, page] of this.pages) {
      try {
        await page.close();
      } catch (error) {
        logger.warn(`Failed to close page ${pageId}:`, error.message);
      }
    }
    this.pages.clear();
    
    // Close all contexts
    for (const [contextId, context] of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        logger.warn(`Failed to close context ${contextId}:`, error.message);
      }
    }
    this.contexts.clear();
    
    // Close all browsers
    for (const [browserKey, browser] of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        logger.warn(`Failed to close browser ${browserKey}:`, error.message);
      }
    }
    this.browsers.clear();
    
    this.initialized = false;
    logger.info('Playwright MCP Server cleanup completed');
  }

  getCapabilities() {
    return {
      browserSupport: this.supportedBrowsers,
      tools: [
        'playwright_create_context',
        'playwright_create_page',
        'playwright_navigate',
        'playwright_click',
        'playwright_type',
        'playwright_get_text',
        'playwright_screenshot',
        'playwright_wait_for_selector',
        'playwright_evaluate',
        'playwright_close_page',
        'playwright_close_context',
        'playwright_get_url',
        'playwright_get_title',
        'playwright_list_pages',
        'playwright_list_contexts'
      ],
      features: [
        'browser_management',
        'context_isolation',
        'page_automation',
        'screenshot_capture',
        'script_evaluation',
        'element_interaction'
      ]
    };
  }
}

module.exports = PlaywrightMCPServer;