const PlaywrightMCPServer = require('../../src/services/playwright-mcp-server');
const { chromium } = require('playwright');

describe('PlaywrightMCPServer', () => {
  let server;

  beforeEach(async () => {
    server = new PlaywrightMCPServer();
  });

  afterEach(async () => {
    if (server) {
      await server.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(server.name).toBe('playwright-mcp-server');
      expect(server.version).toBe('1.0.0');
      expect(server.initialized).toBe(false);
      expect(server.supportedBrowsers).toEqual(['chromium', 'firefox', 'webkit']);
    });

    test('should initialize successfully', async () => {
      await server.initialize();
      expect(server.initialized).toBe(true);
    });

    test('should not reinitialize if already initialized', async () => {
      await server.initialize();
      const firstInitialization = server.initialized;
      await server.initialize();
      expect(server.initialized).toBe(firstInitialization);
    });
  });

  describe('Browser Management', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    test('should create browser instance', async () => {
      const browser = await server.getBrowser('chromium');
      expect(browser).toBeDefined();
      expect(browser.isConnected()).toBe(true);
    });

    test('should reuse existing browser instance', async () => {
      const browser1 = await server.getBrowser('chromium');
      const browser2 = await server.getBrowser('chromium');
      expect(browser1).toBe(browser2);
    });

    test('should throw error for unsupported browser', async () => {
      await expect(server.getBrowser('unsupported')).rejects.toThrow('Unsupported browser: unsupported');
    });

    test('should create browser with custom config', async () => {
      const customConfig = {
        headless: false,
        args: ['--start-maximized'],
        viewport: { width: 1920, height: 1080 }
      };
      const browser = await server.getBrowser('chromium', customConfig);
      expect(browser).toBeDefined();
      expect(browser.isConnected()).toBe(true);
    });
  });

  describe('Context Management', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    test('should create browser context', async () => {
      const result = await server.createContext('chromium');
      expect(result).toBeDefined();
      expect(result.contextId).toBeDefined();
      expect(result.context).toBeDefined();
    });

    test('should create context with custom config', async () => {
      const contextConfig = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Custom User Agent',
        locale: 'en-GB'
      };
      const result = await server.createContext('chromium', contextConfig);
      expect(result).toBeDefined();
      expect(result.contextId).toBeDefined();
      expect(result.context).toBeDefined();
    });

    test('should track created contexts', async () => {
      const result = await server.createContext('chromium');
      const contexts = server.listContexts();
      expect(contexts).toContain(result.contextId);
    });
  });

  describe('Page Management', () => {
    let contextId;

    beforeEach(async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      contextId = contextResult.contextId;
    });

    test('should create page in context', async () => {
      const result = await server.createPage(contextId);
      expect(result).toBeDefined();
      expect(result.pageId).toBeDefined();
      expect(result.page).toBeDefined();
    });

    test('should throw error for invalid context', async () => {
      await expect(server.createPage('invalid-context')).rejects.toThrow('Context invalid-context not found');
    });

    test('should track created pages', async () => {
      const result = await server.createPage(contextId);
      const pages = server.listPages();
      expect(pages).toHaveLength(1);
      expect(pages[0].pageId).toBe(result.pageId);
    });

    test('should get page by ID', async () => {
      const result = await server.createPage(contextId);
      const page = server.getPage(result.pageId);
      expect(page).toBe(result.page);
    });

    test('should throw error for invalid page ID', () => {
      expect(() => server.getPage('invalid-page')).toThrow('Page invalid-page not found');
    });
  });

  describe('Tool Call Processing', () => {
    let contextId, pageId;

    beforeEach(async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      contextId = contextResult.contextId;
      const pageResult = await server.createPage(contextId);
      pageId = pageResult.pageId;
    });

    test('should process create context tool call', async () => {
      const result = await server.processToolCall('playwright_create_context', {
        browser: 'chromium',
        config: { headless: true }
      });
      expect(result.success).toBe(true);
      expect(result.result.contextId).toBeDefined();
    });

    test('should process create page tool call', async () => {
      const result = await server.processToolCall('playwright_create_page', {
        contextId
      });
      expect(result.success).toBe(true);
      expect(result.result.pageId).toBeDefined();
    });

    test('should process navigate tool call', async () => {
      const result = await server.processToolCall('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });
      expect(result.success).toBe(true);
      expect(result.result.url).toBe('about:blank');
    });

    test('should process get URL tool call', async () => {
      await server.processToolCall('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });
      const result = await server.processToolCall('playwright_get_url', {
        pageId
      });
      expect(result.success).toBe(true);
      expect(result.result.url).toBe('about:blank');
    });

    test('should process get title tool call', async () => {
      await server.processToolCall('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });
      const result = await server.processToolCall('playwright_get_title', {
        pageId
      });
      expect(result.success).toBe(true);
      expect(result.result.title).toBeDefined();
    });

    test('should process list pages tool call', async () => {
      const result = await server.processToolCall('playwright_list_pages', {});
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
    });

    test('should process list contexts tool call', async () => {
      const result = await server.processToolCall('playwright_list_contexts', {});
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
    });

    test('should handle unknown tool call', async () => {
      const result = await server.processToolCall('unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: unknown_tool');
    });

    test('should handle tool call errors', async () => {
      const result = await server.processToolCall('playwright_navigate', {
        pageId: 'invalid-page',
        url: 'about:blank'
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Navigation and Interaction', () => {
    let contextId, pageId;

    beforeEach(async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      contextId = contextResult.contextId;
      const pageResult = await server.createPage(contextId);
      pageId = pageResult.pageId;
    });

    test('should navigate to URL', async () => {
      const result = await server.navigate(pageId, 'about:blank');
      expect(result.url).toBe('about:blank');
      expect(result.title).toBeDefined();
    });

    test('should navigate with options', async () => {
      const result = await server.navigate(pageId, 'about:blank', {
        waitUntil: 'load',
        timeout: 10000
      });
      expect(result.url).toBe('about:blank');
    });

    test('should take screenshot', async () => {
      await server.navigate(pageId, 'about:blank');
      const result = await server.screenshot(pageId);
      expect(result.screenshot).toBeDefined();
      expect(typeof result.screenshot).toBe('string');
    });

    test('should take screenshot with options', async () => {
      await server.navigate(pageId, 'about:blank');
      const result = await server.screenshot(pageId, {
        type: 'jpeg',
        quality: 80,
        fullPage: true
      });
      expect(result.screenshot).toBeDefined();
    });

    test('should evaluate JavaScript', async () => {
      await server.navigate(pageId, 'about:blank');
      const result = await server.evaluate(pageId, '() => 2 + 2');
      expect(result.result).toBe(4);
    });

    test('should evaluate JavaScript with arguments', async () => {
      await server.navigate(pageId, 'about:blank');
      const result = await server.evaluate(pageId, '(a, b) => a + b', [3, 4]);
      expect(result.result).toBe(7);
    });
  });

  describe('Resource Management', () => {
    let contextId, pageId;

    beforeEach(async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      contextId = contextResult.contextId;
      const pageResult = await server.createPage(contextId);
      pageId = pageResult.pageId;
    });

    test('should close page', async () => {
      const result = await server.closePage(pageId);
      expect(result.success).toBe(true);
      expect(() => server.getPage(pageId)).toThrow();
    });

    test('should close context', async () => {
      const result = await server.closeContext(contextId);
      expect(result.success).toBe(true);
      const contexts = server.listContexts();
      expect(contexts).not.toContain(contextId);
    });

    test('should throw error when closing invalid context', async () => {
      await expect(server.closeContext('invalid-context')).rejects.toThrow('Context invalid-context not found');
    });
  });

  describe('Health and Status', () => {
    test('should report healthy status when initialized', async () => {
      await server.initialize();
      const status = await server.getHealthStatus();
      expect(status.healthy).toBe(true);
      expect(status.details.initialized).toBe(true);
      expect(status.details.supportedBrowsers).toEqual(['chromium', 'firefox', 'webkit']);
    });

    test('should report capabilities', () => {
      const capabilities = server.getCapabilities();
      expect(capabilities.browserSupport).toEqual(['chromium', 'firefox', 'webkit']);
      expect(capabilities.tools).toBeInstanceOf(Array);
      expect(capabilities.tools).toContain('playwright_create_context');
      expect(capabilities.tools).toContain('playwright_navigate');
      expect(capabilities.features).toBeInstanceOf(Array);
      expect(capabilities.features).toContain('browser_management');
    });
  });

  describe('Cleanup', () => {
    test('should cleanup all resources', async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      const pageResult = await server.createPage(contextResult.contextId);
      
      // Verify resources exist
      expect(server.listContexts()).toHaveLength(1);
      expect(server.listPages()).toHaveLength(1);
      
      await server.cleanup();
      
      // Verify resources are cleaned up
      expect(server.listContexts()).toHaveLength(0);
      expect(server.listPages()).toHaveLength(0);
      expect(server.initialized).toBe(false);
    });

    test('should handle cleanup errors gracefully', async () => {
      await server.initialize();
      const contextResult = await server.createContext('chromium');
      const pageResult = await server.createPage(contextResult.contextId);
      
      // Close page manually to simulate cleanup error
      await server.getPage(pageResult.pageId).close();
      
      // Cleanup should still complete without throwing
      await expect(server.cleanup()).resolves.not.toThrow();
      expect(server.initialized).toBe(false);
    });
  });
});