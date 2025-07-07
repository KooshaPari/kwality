const PlaywrightConfig = require('../../src/services/playwright-config');
const fs = require('fs').promises;
const path = require('path');

describe('PlaywrightConfig', () => {
  let config;
  let tempConfigPath;

  beforeEach(() => {
    config = new PlaywrightConfig();
    tempConfigPath = path.join(__dirname, '../../temp-test-config.json');
    config.configPath = tempConfigPath;
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempConfigPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(config.defaultConfig).toBeDefined();
      expect(config.defaultConfig.browsers).toBeDefined();
      expect(config.defaultConfig.browsers.chromium).toBeDefined();
      expect(config.defaultConfig.browsers.firefox).toBeDefined();
      expect(config.defaultConfig.browsers.webkit).toBeDefined();
      expect(config.defaultConfig.mcp).toBeDefined();
      expect(config.defaultConfig.security).toBeDefined();
    });

    test('should initialize successfully', async () => {
      await config.initialize();
      expect(config.config).toBeDefined();
      expect(config.config.browsers).toBeDefined();
    });

    test('should create config file if it does not exist', async () => {
      await config.initialize();
      const configExists = await fs.access(tempConfigPath).then(() => true).catch(() => false);
      expect(configExists).toBe(true);
    });

    test('should load existing config file', async () => {
      const customConfig = {
        browsers: {
          chromium: { enabled: false }
        }
      };
      await fs.writeFile(tempConfigPath, JSON.stringify(customConfig));
      
      await config.initialize();
      expect(config.config.browsers.chromium.enabled).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should validate valid configuration', async () => {
      await expect(config.validateConfig()).resolves.not.toThrow();
    });

    test('should fail validation for invalid browsers config', async () => {
      config.config.browsers = null;
      await expect(config.validateConfig()).rejects.toThrow('Invalid browsers configuration');
    });

    test('should fail validation for invalid MCP port', async () => {
      config.config.mcp.enabled = true;
      config.config.mcp.port = 'invalid';
      await expect(config.validateConfig()).rejects.toThrow('Invalid MCP port configuration');
    });

    test('should fail validation for invalid MCP host', async () => {
      config.config.mcp.enabled = true;
      config.config.mcp.host = null;
      await expect(config.validateConfig()).rejects.toThrow('Invalid MCP host configuration');
    });

    test('should fail validation for invalid security limits', async () => {
      config.config.security.maxConcurrentBrowsers = 0;
      await expect(config.validateConfig()).rejects.toThrow('maxConcurrentBrowsers must be at least 1');
    });
  });

  describe('Browser Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get browser configuration', () => {
      const chromiumConfig = config.getBrowserConfig('chromium');
      expect(chromiumConfig).toBeDefined();
      expect(chromiumConfig.enabled).toBe(true);
      expect(chromiumConfig.headless).toBe(true);
      expect(chromiumConfig.viewport).toBeDefined();
    });

    test('should throw error for unknown browser', () => {
      expect(() => config.getBrowserConfig('unknown')).toThrow('Browser unknown not configured');
    });

    test('should throw error for disabled browser', () => {
      config.config.browsers.chromium.enabled = false;
      expect(() => config.getBrowserConfig('chromium')).toThrow('Browser chromium is disabled');
    });

    test('should update browser configuration', async () => {
      await config.updateBrowserConfig('chromium', { headless: false });
      const chromiumConfig = config.getBrowserConfig('chromium');
      expect(chromiumConfig.headless).toBe(false);
    });

    test('should get enabled browsers', () => {
      const enabledBrowsers = config.getEnabledBrowsers();
      expect(enabledBrowsers).toContain('chromium');
      expect(enabledBrowsers).toContain('firefox');
      expect(enabledBrowsers).toContain('webkit');
    });

    test('should check if browser is enabled', () => {
      expect(config.isBrowserEnabled('chromium')).toBe(true);
      expect(config.isBrowserEnabled('firefox')).toBe(true);
      expect(config.isBrowserEnabled('webkit')).toBe(true);
    });
  });

  describe('Context Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get default context configuration', () => {
      const contextConfig = config.getContextConfig();
      expect(contextConfig).toBeDefined();
      expect(contextConfig.viewport).toBeDefined();
      expect(contextConfig.locale).toBe('en-US');
      expect(contextConfig.timezone).toBe('UTC');
    });

    test('should get named context configuration', () => {
      const contextConfig = config.getContextConfig('default');
      expect(contextConfig).toBeDefined();
      expect(contextConfig.viewport).toBeDefined();
    });

    test('should fallback to default for unknown context', () => {
      const contextConfig = config.getContextConfig('unknown');
      expect(contextConfig).toBe(config.config.contexts.default);
    });
  });

  describe('MCP Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get MCP configuration', () => {
      const mcpConfig = config.getMCPConfig();
      expect(mcpConfig).toBeDefined();
      expect(mcpConfig.enabled).toBe(true);
      expect(mcpConfig.port).toBe(3001);
      expect(mcpConfig.host).toBe('localhost');
      expect(mcpConfig.tools).toBeDefined();
    });

    test('should update MCP configuration', async () => {
      await config.updateMCPConfig({ port: 4000 });
      const mcpConfig = config.getMCPConfig();
      expect(mcpConfig.port).toBe(4000);
    });

    test('should check if MCP is enabled', () => {
      expect(config.isEnabled()).toBe(true);
    });

    test('should get tool permissions', () => {
      const permissions = config.getToolPermissions();
      expect(permissions).toBeDefined();
      expect(permissions.navigation).toBe(true);
      expect(permissions.interaction).toBe(true);
    });

    test('should check if tool is enabled', () => {
      expect(config.isToolEnabled('navigation')).toBe(true);
      expect(config.isToolEnabled('interaction')).toBe(true);
    });
  });

  describe('Security Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get security configuration', () => {
      const securityConfig = config.getSecurityConfig();
      expect(securityConfig).toBeDefined();
      expect(securityConfig.maxConcurrentBrowsers).toBe(5);
      expect(securityConfig.maxConcurrentContexts).toBe(10);
      expect(securityConfig.maxConcurrentPages).toBe(20);
      expect(securityConfig.sessionTimeout).toBe(3600000);
    });

    test('should get resource limits', () => {
      const limits = config.getResourceLimits();
      expect(limits).toBeDefined();
      expect(limits.maxConcurrentBrowsers).toBe(5);
      expect(limits.maxConcurrentContexts).toBe(10);
      expect(limits.maxConcurrentPages).toBe(20);
      expect(limits.sessionTimeout).toBe(3600000);
    });
  });

  describe('Performance Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get performance configuration', () => {
      const performanceConfig = config.getPerformanceConfig();
      expect(performanceConfig).toBeDefined();
      expect(performanceConfig.enableHar).toBe(false);
      expect(performanceConfig.enableCoverage).toBe(false);
      expect(performanceConfig.enableMetrics).toBe(true);
      expect(performanceConfig.enableTracing).toBe(false);
    });
  });

  describe('Media Configuration', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get screenshot configuration', () => {
      const screenshotConfig = config.getScreenshotConfig();
      expect(screenshotConfig).toBeDefined();
      expect(screenshotConfig.enabled).toBe(true);
      expect(screenshotConfig.format).toBe('png');
      expect(screenshotConfig.quality).toBe(90);
      expect(screenshotConfig.path).toBeDefined();
    });

    test('should get download configuration', () => {
      const downloadConfig = config.getDownloadConfig();
      expect(downloadConfig).toBeDefined();
      expect(downloadConfig.enabled).toBe(true);
      expect(downloadConfig.path).toBeDefined();
    });

    test('should get trace configuration', () => {
      const traceConfig = config.getTraceConfig();
      expect(traceConfig).toBeDefined();
      expect(traceConfig.enabled).toBe(false);
      expect(traceConfig.path).toBeDefined();
      expect(traceConfig.screenshots).toBe(true);
    });

    test('should get video configuration', () => {
      const videoConfig = config.getVideoConfig();
      expect(videoConfig).toBeDefined();
      expect(videoConfig.enabled).toBe(false);
      expect(videoConfig.path).toBeDefined();
      expect(videoConfig.size).toBeDefined();
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should update configuration', async () => {
      const updates = {
        mcp: { port: 4000 }
      };
      await config.updateConfig(updates);
      expect(config.config.mcp.port).toBe(4000);
    });

    test('should save configuration after update', async () => {
      const updates = {
        mcp: { port: 4000 }
      };
      await config.updateConfig(updates);
      
      // Reload config from file
      const configData = await fs.readFile(tempConfigPath, 'utf8');
      const savedConfig = JSON.parse(configData);
      expect(savedConfig.mcp.port).toBe(4000);
    });

    test('should validate configuration after update', async () => {
      const invalidUpdates = {
        security: { maxConcurrentBrowsers: 0 }
      };
      await expect(config.updateConfig(invalidUpdates)).rejects.toThrow();
    });
  });

  describe('Configuration Reset', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should reset to default configuration', async () => {
      // Modify config
      config.config.mcp.port = 4000;
      
      // Reset
      await config.reset();
      
      expect(config.config.mcp.port).toBe(3001);
    });

    test('should save reset configuration', async () => {
      // Modify and reset
      config.config.mcp.port = 4000;
      await config.reset();
      
      // Reload from file
      const configData = await fs.readFile(tempConfigPath, 'utf8');
      const savedConfig = JSON.parse(configData);
      expect(savedConfig.mcp.port).toBe(3001);
    });
  });

  describe('Configuration Retrieval', () => {
    beforeEach(async () => {
      await config.initialize();
    });

    test('should get complete configuration', () => {
      const fullConfig = config.getConfig();
      expect(fullConfig).toBeDefined();
      expect(fullConfig.browsers).toBeDefined();
      expect(fullConfig.mcp).toBeDefined();
      expect(fullConfig.security).toBeDefined();
      
      // Should be a copy, not reference
      fullConfig.mcp.port = 9999;
      expect(config.config.mcp.port).toBe(3001);
    });
  });

  describe('Error Handling', () => {
    test('should handle file read errors gracefully', async () => {
      // Set invalid config path that doesn't exist but doesn't require root access
      config.configPath = path.join(__dirname, 'nonexistent', 'config.json');
      
      await config.initialize();
      expect(config.config).toEqual(config.defaultConfig);
    });

    test('should handle invalid JSON gracefully', async () => {
      await fs.writeFile(tempConfigPath, 'invalid json');
      
      await config.initialize();
      expect(config.config).toEqual(config.defaultConfig);
    });

    test('should handle file write errors in save', async () => {
      await config.initialize();
      config.configPath = '/invalid/path/config.json';
      
      await expect(config.saveConfig()).rejects.toThrow();
    });
  });
});