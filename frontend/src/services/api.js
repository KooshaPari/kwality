import axios from 'axios';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Validation API endpoints
  async getValidationTargets(params = {}) {
    const response = await this.client.get('/validation/targets', { params });
    return response.data;
  }

  async getValidationSuites(params = {}) {
    const response = await this.client.get('/validation/suites', { params });
    return response.data;
  }

  async createValidationExecution(suiteId, configuration = {}) {
    const response = await this.client.post('/validation/execute', {
      validation_suite_id: suiteId,
      configuration,
    });
    return response.data;
  }

  async getValidationExecution(executionId) {
    const response = await this.client.get(`/validation/executions/${executionId}`);
    return response.data;
  }

  async getValidationExecutions(params = {}) {
    const response = await this.client.get('/validation/executions', { params });
    return response.data;
  }

  // Metrics API endpoints
  async getMetricsOverview() {
    const response = await this.client.get('/metrics/overview');
    return response.data;
  }

  async getPerformanceMetrics(days = 7) {
    const response = await this.client.get('/metrics/performance', {
      params: { days },
    });
    return response.data;
  }

  // Knowledge Graph API endpoints
  async getKnowledgeNodes(params = {}) {
    const response = await this.client.get('/knowledge-graph/nodes', { params });
    return response.data;
  }

  async getKnowledgeRelationships(params = {}) {
    const response = await this.client.get('/knowledge-graph/relationships', { params });
    return response.data;
  }

  // Real-time updates
  async getTestResults(testId) {
    const response = await this.client.get(`/validation/tests/${testId}/results`);
    return response.data;
  }

  async getSystemHealth() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // DeepEval specific endpoints
  async getDeepEvalResults(params = {}) {
    const response = await this.client.get('/validation/deepeval/results', { params });
    return response.data;
  }

  // Playwright MCP endpoints
  async getPlaywrightResults(params = {}) {
    const response = await this.client.get('/validation/playwright/results', { params });
    return response.data;
  }

  // OpenLLMetry endpoints
  async getObservabilityMetrics(params = {}) {
    const response = await this.client.get('/metrics/observability', { params });
    return response.data;
  }

  // TDD workflow endpoints
  async getTddWorkflowStatus(projectId) {
    const response = await this.client.get(`/validation/tdd/${projectId}/status`);
    return response.data;
  }

  async getBurrPytestResults(params = {}) {
    const response = await this.client.get('/validation/burr-pytest/results', { params });
    return response.data;
  }
}

export default new ApiService();
