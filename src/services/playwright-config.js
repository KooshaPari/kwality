const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class PlaywrightConfig {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/playwright.json');
    this.defaultConfig = {
      browsers: {
        chromium: {
          enabled: true,
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
          ],
          timeout: 30000,
          viewport: { width: 1280, height: 720 }
        },
        firefox: {
          enabled: true,
          headless: true,
          args: [],
          timeout: 30000,
          viewport: { width: 1280, height: 720 }
        },
        webkit: {
          enabled: true,
          headless: true,
          args: [],
          timeout: 30000,
          viewport: { width: 1280, height: 720 }
        }
      },
      contexts: {
        default: {
          viewport: { width: 1280, height: 720 },
          userAgent: null,
          locale: 'en-US',
          timezone: 'UTC',
          permissions: [],
          geolocation: null,
          colorScheme: 'light',
          reducedMotion: 'no-preference',
          forcedColors: 'none'
        }
      },
      screenshots: {
        enabled: true,
        format: 'png',
        quality: 90,
        fullPage: false,
        path: path.join(__dirname, '../../screenshots')
      },
      downloads: {
        enabled: true,
        path: path.join(__dirname, '../../downloads')
      },
      traces: {
        enabled: false,
        path: path.join(__dirname, '../../traces'),
        screenshots: true,
        snapshots: true,
        sources: true
      },
      videos: {
        enabled: false,
        path: path.join(__dirname, '../../videos'),
        size: { width: 1280, height: 720 }
      },
      mcp: {
        enabled: true,
        port: 3001,
        host: 'localhost',
        tools: {
          navigation: true,
          interaction: true,
          evaluation: true,
          screenshots: true,
          management: true
        }
      },
      security: {
        allowInsecureContent: false,
        bypassCSP: false,
        ignoreHTTPSErrors: false,
        maxConcurrentBrowsers: 5,
        maxConcurrentContexts: 10,
        maxConcurrentPages: 20,
        sessionTimeout: 3600000 // 1 hour
      },
      performance: {
        enableHar: false,
        enableCoverage: false,
        enableMetrics: true,
        enableTracing: false
      }
    };
    this.config = null;
  }

  async initialize() {
    try {
      await this.loadConfig();
      await this.validateConfig();
      await this.createDirectories();
      logger.info('Playwright configuration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Playwright configuration:', error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      // Try to load existing config
      const configData = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      this.config = this._deepMerge(JSON.parse(JSON.stringify(this.defaultConfig)), loadedConfig);
      logger.info('Loaded existing Playwright configuration');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create with defaults
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        await this.saveConfig();
        logger.info('Created new Playwright configuration with defaults');
      } else {
        // Other error, use defaults but log warning
        logger.warn('Failed to load Playwright configuration, using defaults:', error.message);
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
      }
    }
  }

  _deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  async saveConfig() {
    try {
      const configDir = path.dirname(this.configPath);
      try {
        await fs.mkdir(configDir, { recursive: true });
      } catch (mkdirError) {
        // If directory creation fails, still try to write the file
        logger.warn('Failed to create config directory:', mkdirError.message);
      }
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      logger.info('Playwright configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save Playwright configuration:', error);
      throw error;
    }
  }

  async validateConfig() {
    const errors = [];

    // Validate browsers
    if (!this.config.browsers || typeof this.config.browsers !== 'object') {
      errors.push('Invalid browsers configuration');
    }

    // Validate MCP settings
    if (this.config.mcp && this.config.mcp.enabled) {
      if (!this.config.mcp.port || typeof this.config.mcp.port !== 'number') {
        errors.push('Invalid MCP port configuration');
      }
      if (!this.config.mcp.host || typeof this.config.mcp.host !== 'string') {
        errors.push('Invalid MCP host configuration');
      }
    }

    // Validate security settings
    if (this.config.security) {
      if (this.config.security.maxConcurrentBrowsers < 1) {
        errors.push('maxConcurrentBrowsers must be at least 1');
      }
      if (this.config.security.maxConcurrentContexts < 1) {
        errors.push('maxConcurrentContexts must be at least 1');
      }
      if (this.config.security.maxConcurrentPages < 1) {
        errors.push('maxConcurrentPages must be at least 1');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    logger.info('Playwright configuration validated successfully');
  }

  async createDirectories() {
    const directories = [
      this.config.screenshots.path,
      this.config.downloads.path,
      this.config.traces.path,
      this.config.videos.path
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        logger.warn(`Failed to create directory ${dir}:`, error.message);
      }
    }
  }

  getBrowserConfig(browserName) {
    const browserConfig = this.config.browsers[browserName];
    if (!browserConfig) {
      throw new Error(`Browser ${browserName} not configured`);
    }
    if (!browserConfig.enabled) {
      throw new Error(`Browser ${browserName} is disabled`);
    }
    return browserConfig;
  }

  getContextConfig(contextName = 'default') {
    const contextConfig = this.config.contexts[contextName];
    if (!contextConfig) {
      return this.config.contexts.default;
    }
    return contextConfig;
  }

  getMCPConfig() {
    return this.config.mcp;
  }

  getSecurityConfig() {
    return this.config.security;
  }

  getPerformanceConfig() {
    return this.config.performance;
  }

  getScreenshotConfig() {
    return this.config.screenshots;
  }

  getDownloadConfig() {
    return this.config.downloads;
  }

  getTraceConfig() {
    return this.config.traces;
  }

  getVideoConfig() {
    return this.config.videos;
  }

  async updateConfig(updates) {
    try {
      this.config = { ...this.config, ...updates };
      await this.validateConfig();
      await this.saveConfig();
      logger.info('Playwright configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update Playwright configuration:', error);
      throw error;
    }
  }

  async updateBrowserConfig(browserName, updates) {
    try {
      this.config.browsers[browserName] = { 
        ...this.config.browsers[browserName], 
        ...updates 
      };
      await this.validateConfig();
      await this.saveConfig();
      logger.info(`Browser ${browserName} configuration updated successfully`);
    } catch (error) {
      logger.error(`Failed to update browser ${browserName} configuration:`, error);
      throw error;
    }
  }

  async updateMCPConfig(updates) {
    try {
      this.config.mcp = { ...this.config.mcp, ...updates };
      await this.validateConfig();
      await this.saveConfig();
      logger.info('MCP configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update MCP configuration:', error);
      throw error;
    }
  }

  async reset() {
    try {
      this.config = JSON.parse(JSON.stringify(this.defaultConfig));
      await this.saveConfig();
      logger.info('Playwright configuration reset to defaults');
    } catch (error) {
      logger.error('Failed to reset Playwright configuration:', error);
      throw error;
    }
  }

  getConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  isEnabled() {
    return this.config && this.config.mcp && this.config.mcp.enabled;
  }

  isBrowserEnabled(browserName) {
    return this.config.browsers[browserName] && this.config.browsers[browserName].enabled;
  }

  getEnabledBrowsers() {
    return Object.keys(this.config.browsers).filter(browserName => 
      this.config.browsers[browserName].enabled
    );
  }

  getResourceLimits() {
    return {
      maxConcurrentBrowsers: this.config.security.maxConcurrentBrowsers,
      maxConcurrentContexts: this.config.security.maxConcurrentContexts,
      maxConcurrentPages: this.config.security.maxConcurrentPages,
      sessionTimeout: this.config.security.sessionTimeout
    };
  }

  getToolPermissions() {
    return this.config.mcp.tools;
  }

  isToolEnabled(toolName) {
    return this.config.mcp.tools[toolName] !== false;
  }
}

module.exports = PlaywrightConfig;