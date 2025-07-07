const logger = require('../utils/logger');

class PlaywrightMCPTools {
  constructor(mcpServer) {
    this.mcpServer = mcpServer;
    this.tools = this.defineTools();
  }

  defineTools() {
    return {
      playwright_create_context: {
        name: 'playwright_create_context',
        description: 'Create a new browser context with specified configuration',
        inputSchema: {
          type: 'object',
          properties: {
            browser: {
              type: 'string',
              enum: ['chromium', 'firefox', 'webkit'],
              default: 'chromium',
              description: 'Browser type to use'
            },
            config: {
              type: 'object',
              properties: {
                headless: {
                  type: 'boolean',
                  default: true,
                  description: 'Run browser in headless mode'
                },
                viewport: {
                  type: 'object',
                  properties: {
                    width: { type: 'number', default: 1280 },
                    height: { type: 'number', default: 720 }
                  },
                  description: 'Browser viewport dimensions'
                },
                userAgent: {
                  type: 'string',
                  description: 'Custom user agent string'
                },
                locale: {
                  type: 'string',
                  description: 'Browser locale'
                },
                timezone: {
                  type: 'string',
                  description: 'Browser timezone'
                }
              },
              description: 'Browser context configuration'
            }
          },
          required: []
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_create_context', args)
      },

      playwright_create_page: {
        name: 'playwright_create_page',
        description: 'Create a new page in the specified context',
        inputSchema: {
          type: 'object',
          properties: {
            contextId: {
              type: 'string',
              description: 'Context ID to create page in'
            }
          },
          required: ['contextId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_create_page', args)
      },

      playwright_navigate: {
        name: 'playwright_navigate',
        description: 'Navigate to a URL',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to navigate'
            },
            url: {
              type: 'string',
              description: 'URL to navigate to'
            },
            options: {
              type: 'object',
              properties: {
                waitUntil: {
                  type: 'string',
                  enum: ['load', 'domcontentloaded', 'networkidle'],
                  default: 'networkidle',
                  description: 'When to consider navigation complete'
                },
                timeout: {
                  type: 'number',
                  default: 30000,
                  description: 'Navigation timeout in milliseconds'
                }
              },
              description: 'Navigation options'
            }
          },
          required: ['pageId', 'url']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_navigate', args)
      },

      playwright_click: {
        name: 'playwright_click',
        description: 'Click on an element',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to perform click on'
            },
            selector: {
              type: 'string',
              description: 'CSS selector of element to click'
            },
            options: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  default: 30000,
                  description: 'Click timeout in milliseconds'
                },
                force: {
                  type: 'boolean',
                  default: false,
                  description: 'Force click even if element is not visible'
                },
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' }
                  },
                  description: 'Click position relative to element'
                }
              },
              description: 'Click options'
            }
          },
          required: ['pageId', 'selector']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_click', args)
      },

      playwright_type: {
        name: 'playwright_type',
        description: 'Type text into an input element',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to type on'
            },
            selector: {
              type: 'string',
              description: 'CSS selector of input element'
            },
            text: {
              type: 'string',
              description: 'Text to type'
            },
            options: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  default: 30000,
                  description: 'Type timeout in milliseconds'
                },
                delay: {
                  type: 'number',
                  default: 0,
                  description: 'Delay between key presses in milliseconds'
                }
              },
              description: 'Type options'
            }
          },
          required: ['pageId', 'selector', 'text']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_type', args)
      },

      playwright_get_text: {
        name: 'playwright_get_text',
        description: 'Get text content of an element',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to get text from'
            },
            selector: {
              type: 'string',
              description: 'CSS selector of element to get text from'
            },
            options: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  default: 30000,
                  description: 'Get text timeout in milliseconds'
                }
              },
              description: 'Get text options'
            }
          },
          required: ['pageId', 'selector']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_get_text', args)
      },

      playwright_screenshot: {
        name: 'playwright_screenshot',
        description: 'Take a screenshot of the page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to screenshot'
            },
            options: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['png', 'jpeg'],
                  default: 'png',
                  description: 'Screenshot format'
                },
                fullPage: {
                  type: 'boolean',
                  default: false,
                  description: 'Take full page screenshot'
                },
                clip: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' }
                  },
                  description: 'Screenshot clip area'
                },
                quality: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'JPEG quality (0-100)'
                }
              },
              description: 'Screenshot options'
            }
          },
          required: ['pageId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_screenshot', args)
      },

      playwright_wait_for_selector: {
        name: 'playwright_wait_for_selector',
        description: 'Wait for an element to appear',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to wait on'
            },
            selector: {
              type: 'string',
              description: 'CSS selector to wait for'
            },
            options: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  default: 30000,
                  description: 'Wait timeout in milliseconds'
                },
                state: {
                  type: 'string',
                  enum: ['attached', 'detached', 'visible', 'hidden'],
                  default: 'visible',
                  description: 'Element state to wait for'
                }
              },
              description: 'Wait options'
            }
          },
          required: ['pageId', 'selector']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_wait_for_selector', args)
      },

      playwright_evaluate: {
        name: 'playwright_evaluate',
        description: 'Execute JavaScript in the browser context',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to execute script on'
            },
            script: {
              type: 'string',
              description: 'JavaScript code to execute'
            },
            args: {
              type: 'array',
              description: 'Arguments to pass to the script'
            }
          },
          required: ['pageId', 'script']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_evaluate', args)
      },

      playwright_close_page: {
        name: 'playwright_close_page',
        description: 'Close a page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to close'
            }
          },
          required: ['pageId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_close_page', args)
      },

      playwright_close_context: {
        name: 'playwright_close_context',
        description: 'Close a browser context',
        inputSchema: {
          type: 'object',
          properties: {
            contextId: {
              type: 'string',
              description: 'Context ID to close'
            }
          },
          required: ['contextId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_close_context', args)
      },

      playwright_get_url: {
        name: 'playwright_get_url',
        description: 'Get current URL of a page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to get URL from'
            }
          },
          required: ['pageId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_get_url', args)
      },

      playwright_get_title: {
        name: 'playwright_get_title',
        description: 'Get page title',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page ID to get title from'
            }
          },
          required: ['pageId']
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_get_title', args)
      },

      playwright_list_pages: {
        name: 'playwright_list_pages',
        description: 'List all active pages',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_list_pages', args)
      },

      playwright_list_contexts: {
        name: 'playwright_list_contexts',
        description: 'List all active browser contexts',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        handler: async (args) => await this.mcpServer.handleToolCall('playwright_list_contexts', args)
      }
    };
  }

  async executeTool(toolName, args) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    try {
      logger.info(`Executing MCP tool: ${toolName}`, { args });
      const result = await tool.handler(args);
      logger.info(`MCP tool executed successfully: ${toolName}`, { success: true });
      return result;
    } catch (error) {
      logger.error(`MCP tool execution failed: ${toolName}`, { error: error.message, args });
      throw error;
    }
  }

  validateArgs(toolName, args) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const schema = tool.inputSchema;
    if (!schema) {
      return true;
    }

    const requiredFields = schema.required || [];
    for (const field of requiredFields) {
      if (!(field in args)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return true;
  }

  getToolList() {
    return Object.keys(this.tools).map(toolName => ({
      name: toolName,
      description: this.tools[toolName].description,
      inputSchema: this.tools[toolName].inputSchema
    }));
  }

  getToolSchema(toolName) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return tool.inputSchema;
  }
}

module.exports = PlaywrightMCPTools;