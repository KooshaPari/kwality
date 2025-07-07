const PlaywrightMCPTools = require('../../src/services/playwright-mcp-tools');
const PlaywrightMCPServer = require('../../src/services/playwright-mcp-server');

describe('PlaywrightMCPTools', () => {
  let mcpServer;
  let mcpTools;

  beforeEach(async () => {
    mcpServer = new PlaywrightMCPServer();
    await mcpServer.initialize();
    mcpTools = new PlaywrightMCPTools(mcpServer);
  });

  afterEach(async () => {
    if (mcpServer) {
      await mcpServer.cleanup();
    }
  });

  describe('Tool Definition', () => {
    test('should define all expected tools', () => {
      const tools = mcpTools.tools;
      
      const expectedTools = [
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
      ];

      expectedTools.forEach(toolName => {
        expect(tools[toolName]).toBeDefined();
        expect(tools[toolName].name).toBe(toolName);
        expect(tools[toolName].description).toBeDefined();
        expect(tools[toolName].inputSchema).toBeDefined();
        expect(tools[toolName].handler).toBeDefined();
      });
    });

    test('should have proper input schemas', () => {
      const createContextTool = mcpTools.tools.playwright_create_context;
      expect(createContextTool.inputSchema.type).toBe('object');
      expect(createContextTool.inputSchema.properties.browser).toBeDefined();
      expect(createContextTool.inputSchema.properties.browser.enum).toEqual(['chromium', 'firefox', 'webkit']);

      const navigateTool = mcpTools.tools.playwright_navigate;
      expect(navigateTool.inputSchema.required).toContain('pageId');
      expect(navigateTool.inputSchema.required).toContain('url');
    });
  });

  describe('Tool Execution', () => {
    let contextId, pageId;

    beforeEach(async () => {
      const contextResult = await mcpTools.executeTool('playwright_create_context', {
        browser: 'chromium',
        config: { headless: true }
      });
      contextId = contextResult.result.contextId;

      const pageResult = await mcpTools.executeTool('playwright_create_page', {
        contextId
      });
      pageId = pageResult.result.pageId;
    });

    test('should execute create context tool', async () => {
      const result = await mcpTools.executeTool('playwright_create_context', {
        browser: 'chromium',
        config: { headless: true }
      });
      
      expect(result.success).toBe(true);
      expect(result.result.contextId).toBeDefined();
      expect(result.result.context).toBeDefined();
    });

    test('should execute create page tool', async () => {
      const result = await mcpTools.executeTool('playwright_create_page', {
        contextId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.pageId).toBeDefined();
      expect(result.result.page).toBeDefined();
    });

    test('should execute navigate tool', async () => {
      const result = await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });
      
      expect(result.success).toBe(true);
      expect(result.result.url).toBe('about:blank');
      expect(result.result.title).toBeDefined();
    });

    test('should execute navigate tool with options', async () => {
      const result = await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank',
        options: {
          waitUntil: 'load',
          timeout: 10000
        }
      });
      
      expect(result.success).toBe(true);
      expect(result.result.url).toBe('about:blank');
    });

    test('should execute get URL tool', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_get_url', {
        pageId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.url).toBe('about:blank');
    });

    test('should execute get title tool', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_get_title', {
        pageId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.title).toBeDefined();
    });

    test('should execute screenshot tool', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_screenshot', {
        pageId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.screenshot).toBeDefined();
      expect(typeof result.result.screenshot).toBe('string');
    });

    test('should execute screenshot tool with options', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_screenshot', {
        pageId,
        options: {
          type: 'jpeg',
          quality: 80,
          fullPage: true
        }
      });
      
      expect(result.success).toBe(true);
      expect(result.result.screenshot).toBeDefined();
    });

    test('should execute evaluate tool', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_evaluate', {
        pageId,
        script: '() => 2 + 2'
      });
      
      expect(result.success).toBe(true);
      expect(result.result.result).toBe(4);
    });

    test('should execute evaluate tool with arguments', async () => {
      await mcpTools.executeTool('playwright_navigate', {
        pageId,
        url: 'about:blank'
      });

      const result = await mcpTools.executeTool('playwright_evaluate', {
        pageId,
        script: '(a, b) => a + b',
        args: [3, 4]
      });
      
      expect(result.success).toBe(true);
      expect(result.result.result).toBe(7);
    });

    test('should execute list pages tool', async () => {
      const result = await mcpTools.executeTool('playwright_list_pages', {});
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      expect(result.result.length).toBeGreaterThan(0);
    });

    test('should execute list contexts tool', async () => {
      const result = await mcpTools.executeTool('playwright_list_contexts', {});
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      expect(result.result.length).toBeGreaterThan(0);
    });

    test('should execute close page tool', async () => {
      const result = await mcpTools.executeTool('playwright_close_page', {
        pageId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
    });

    test('should execute close context tool', async () => {
      const result = await mcpTools.executeTool('playwright_close_context', {
        contextId
      });
      
      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
    });
  });

  describe('Validation', () => {
    test('should validate required fields', () => {
      expect(() => {
        mcpTools.validateArgs('playwright_create_page', {});
      }).toThrow('Missing required field: contextId');

      expect(() => {
        mcpTools.validateArgs('playwright_navigate', { pageId: 'test' });
      }).toThrow('Missing required field: url');
    });

    test('should pass validation for valid arguments', () => {
      expect(() => {
        mcpTools.validateArgs('playwright_create_context', {
          browser: 'chromium',
          config: { headless: true }
        });
      }).not.toThrow();

      expect(() => {
        mcpTools.validateArgs('playwright_navigate', {
          pageId: 'test-page',
          url: 'about:blank'
        });
      }).not.toThrow();
    });

    test('should throw error for unknown tool', () => {
      expect(() => {
        mcpTools.validateArgs('unknown_tool', {});
      }).toThrow('Tool unknown_tool not found');
    });
  });

  describe('Error Handling', () => {
    test('should handle tool execution errors', async () => {
      await expect(mcpTools.executeTool('playwright_navigate', {
        pageId: 'invalid-page',
        url: 'about:blank'
      })).rejects.toThrow();
    });

    test('should throw error for unknown tool execution', async () => {
      await expect(mcpTools.executeTool('unknown_tool', {})).rejects.toThrow('Tool unknown_tool not found');
    });
  });

  describe('Tool Metadata', () => {
    test('should return tool list', () => {
      const toolList = mcpTools.getToolList();
      
      expect(Array.isArray(toolList)).toBe(true);
      expect(toolList.length).toBeGreaterThan(0);
      
      toolList.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
      });
    });

    test('should return tool schema', () => {
      const schema = mcpTools.getToolSchema('playwright_create_context');
      
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    test('should throw error for unknown tool schema', () => {
      expect(() => {
        mcpTools.getToolSchema('unknown_tool');
      }).toThrow('Tool unknown_tool not found');
    });
  });

  describe('Integration with MCP Server', () => {
    test('should properly integrate with MCP server', async () => {
      const contextResult = await mcpTools.executeTool('playwright_create_context', {
        browser: 'chromium'
      });
      
      expect(contextResult.success).toBe(true);
      
      // Verify the context was created in the server
      const contexts = mcpServer.listContexts();
      expect(contexts).toContain(contextResult.result.contextId);
    });

    test('should handle server errors properly', async () => {
      // Close the server to simulate error
      await mcpServer.cleanup();
      
      await expect(mcpTools.executeTool('playwright_create_context', {
        browser: 'chromium'
      })).rejects.toThrow();
    });
  });

  describe('Complex Workflows', () => {
    test('should execute complete workflow', async () => {
      // Create context
      const contextResult = await mcpTools.executeTool('playwright_create_context', {
        browser: 'chromium',
        config: { headless: true }
      });
      expect(contextResult.success).toBe(true);
      
      // Create page
      const pageResult = await mcpTools.executeTool('playwright_create_page', {
        contextId: contextResult.result.contextId
      });
      expect(pageResult.success).toBe(true);
      
      // Navigate
      const navigateResult = await mcpTools.executeTool('playwright_navigate', {
        pageId: pageResult.result.pageId,
        url: 'about:blank'
      });
      expect(navigateResult.success).toBe(true);
      
      // Take screenshot
      const screenshotResult = await mcpTools.executeTool('playwright_screenshot', {
        pageId: pageResult.result.pageId
      });
      expect(screenshotResult.success).toBe(true);
      
      // Get URL
      const urlResult = await mcpTools.executeTool('playwright_get_url', {
        pageId: pageResult.result.pageId
      });
      expect(urlResult.success).toBe(true);
      expect(urlResult.result.url).toBe('about:blank');
      
      // Close page
      const closePageResult = await mcpTools.executeTool('playwright_close_page', {
        pageId: pageResult.result.pageId
      });
      expect(closePageResult.success).toBe(true);
      
      // Close context
      const closeContextResult = await mcpTools.executeTool('playwright_close_context', {
        contextId: contextResult.result.contextId
      });
      expect(closeContextResult.success).toBe(true);
    });
  });
});