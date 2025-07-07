const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');

/**
 * Plugin Registry for managing validation plugins
 */
class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.enabledPlugins = new Set();
    this.pluginDirectory = path.join(__dirname, '../../plugins');
    this.initialized = false;
  }

  /**
   * Initialize the plugin registry
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure plugin directory exists
      await fs.mkdir(this.pluginDirectory, { recursive: true });
      
      // Load plugins from directory
      await this.loadPluginsFromDirectory();
      
      this.initialized = true;
      logger.info('Plugin registry initialized', { 
        pluginCount: this.plugins.size,
        enabledCount: this.enabledPlugins.size
      });
    } catch (error) {
      logger.error('Failed to initialize plugin registry', { error: error.message });
      throw error;
    }
  }

  /**
   * Register a plugin
   */
  async register(plugin) {
    if (!this.isValidPlugin(plugin)) {
      throw new Error(`Invalid plugin: ${plugin.name || 'unknown'}`);
    }

    try {
      // Initialize the plugin
      await plugin.initialize();
      
      // Register the plugin
      this.plugins.set(plugin.name, plugin);
      
      logger.info('Plugin registered', {
        name: plugin.name,
        version: plugin.version,
        supportedTypes: plugin.supportedTypes
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to register plugin', {
        name: plugin.name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unregister a plugin
   */
  async unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    try {
      // Disable the plugin first
      await this.disablePlugin(pluginName);
      
      // Cleanup plugin resources
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
      
      // Remove from registry
      this.plugins.delete(pluginName);
      
      logger.info('Plugin unregistered', { name: pluginName });
      return true;
    } catch (error) {
      logger.error('Failed to unregister plugin', {
        name: pluginName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    try {
      // Check plugin health
      const health = await plugin.getHealthStatus();
      if (!health.healthy) {
        throw new Error(`Plugin is not healthy: ${health.message}`);
      }

      this.enabledPlugins.add(pluginName);
      logger.info('Plugin enabled', { name: pluginName });
      return true;
    } catch (error) {
      logger.error('Failed to enable plugin', {
        name: pluginName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginName) {
    if (!this.enabledPlugins.has(pluginName)) {
      return false;
    }

    this.enabledPlugins.delete(pluginName);
    logger.info('Plugin disabled', { name: pluginName });
    return true;
  }

  /**
   * Get a plugin by name
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Get validator for a specific type
   */
  getValidator(type) {
    for (const [pluginName, plugin] of this.plugins) {
      if (this.enabledPlugins.has(pluginName) && plugin.supportedTypes.includes(type)) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * Get all available validator types
   */
  getAvailableTypes() {
    const types = new Set();
    for (const [pluginName, plugin] of this.plugins) {
      if (this.enabledPlugins.has(pluginName)) {
        plugin.supportedTypes.forEach(type => types.add(type));
      }
    }
    return Array.from(types);
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(plugin => ({
      name: plugin.name,
      version: plugin.version,
      supportedTypes: plugin.supportedTypes,
      enabled: this.enabledPlugins.has(plugin.name),
      capabilities: plugin.getCapabilities ? plugin.getCapabilities() : {}
    }));
  }

  /**
   * Get plugin health status
   */
  async getPluginHealth(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return { healthy: false, message: 'Plugin not found' };
    }

    try {
      return await plugin.getHealthStatus();
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }

  /**
   * Get all plugin health statuses
   */
  async getAllPluginHealth() {
    const healthStatuses = {};
    
    for (const [pluginName, plugin] of this.plugins) {
      try {
        healthStatuses[pluginName] = await plugin.getHealthStatus();
      } catch (error) {
        healthStatuses[pluginName] = { healthy: false, message: error.message };
      }
    }
    
    return healthStatuses;
  }

  /**
   * Load plugins from directory
   */
  async loadPluginsFromDirectory() {
    try {
      const files = await fs.readdir(this.pluginDirectory);
      const pluginFiles = files.filter(file => file.endsWith('.js'));
      
      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.pluginDirectory, file);
          const PluginClass = require(pluginPath);
          
          // Create plugin instance
          const plugin = new PluginClass();
          
          // Register the plugin
          await this.register(plugin);
          
          // Enable by default
          await this.enablePlugin(plugin.name);
        } catch (error) {
          logger.error('Failed to load plugin', {
            file,
            error: error.message
          });
          // Continue loading other plugins
        }
      }
    } catch (error) {
      logger.error('Failed to load plugins from directory', {
        directory: this.pluginDirectory,
        error: error.message
      });
    }
  }

  /**
   * Validate plugin structure
   */
  isValidPlugin(plugin) {
    const requiredProperties = ['name', 'version', 'supportedTypes', 'validate'];
    const requiredMethods = ['initialize', 'getHealthStatus'];
    
    // Check required properties
    for (const prop of requiredProperties) {
      if (!plugin[prop]) {
        logger.error('Plugin missing required property', { property: prop });
        return false;
      }
    }
    
    // Check required methods
    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        logger.error('Plugin missing required method', { method });
        return false;
      }
    }
    
    // Check supportedTypes is array
    if (!Array.isArray(plugin.supportedTypes)) {
      logger.error('Plugin supportedTypes must be an array');
      return false;
    }
    
    // Check validate method
    if (typeof plugin.validate !== 'function') {
      logger.error('Plugin validate method must be a function');
      return false;
    }
    
    return true;
  }

  /**
   * Update plugin
   */
  async updatePlugin(pluginName, newVersion) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    try {
      // Disable the plugin
      await this.disablePlugin(pluginName);
      
      // Update plugin (this would involve loading new version)
      // For now, just update the version
      plugin.version = newVersion;
      
      // Re-enable the plugin
      await this.enablePlugin(pluginName);
      
      logger.info('Plugin updated', { name: pluginName, version: newVersion });
      return true;
    } catch (error) {
      logger.error('Failed to update plugin', {
        name: pluginName,
        version: newVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get plugin metrics
   */
  getPluginMetrics() {
    const metrics = {
      totalPlugins: this.plugins.size,
      enabledPlugins: this.enabledPlugins.size,
      disabledPlugins: this.plugins.size - this.enabledPlugins.size,
      pluginsByType: {}
    };

    // Count plugins by supported types
    for (const [pluginName, plugin] of this.plugins) {
      if (this.enabledPlugins.has(pluginName)) {
        plugin.supportedTypes.forEach(type => {
          metrics.pluginsByType[type] = (metrics.pluginsByType[type] || 0) + 1;
        });
      }
    }

    return metrics;
  }
}

module.exports = PluginRegistry;