# LLM Validation Platform (Kwality)

A comprehensive validation infrastructure for Large Language Models with advanced testing frameworks, observability, and TDD workflows.

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/your-org/kwality)
[![Coverage](https://img.shields.io/badge/coverage-80%25-yellow)](https://github.com/your-org/kwality)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue)](https://python.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## 🚀 Features

### Core Validation Frameworks
- **🧠 DeepEval Integration**: 9 advanced LLM evaluation metrics including correctness, faithfulness, bias detection
- **🎭 Playwright MCP**: Browser automation for web-based LLM testing with MCP protocol
- **📊 OpenLLMetry**: Comprehensive observability with semantic, syntactic, safety, and performance metrics
- **🔗 Neo4j Knowledge Graph**: Test execution relationship analysis and dependency tracking
- **🔄 Burr+pytest TDD**: Test-driven development workflows with state machine orchestration

### Advanced Capabilities
- **Claude-Flow Orchestration**: Multi-agent coordination with 17 SPARC development modes
- **Real-time Monitoring**: Performance metrics, error tracking, and health monitoring
- **Scalable Architecture**: Horizontal scaling with swarm coordination
- **Enterprise Security**: Authentication, authorization, and compliance features

## 📋 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ with pip
- Optional: Docker, Neo4j, Claude API access

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/kwality.git
cd kwality

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r python-tests/requirements.txt

# Initialize configuration
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Basic Usage

```bash
# Start the validation platform
npm start

# Run all tests
npm test

# Start with Claude-Flow orchestration
./claude-flow start --ui --port 3000

# Run specific validation framework tests
npm test -- tests/deepeval/
npm test -- tests/playwright/
npm test -- tests/neo4j/
```

## 🏗️ Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DeepEval      │    │   Playwright    │    │  OpenLLMetry    │
│   Framework     │    │   MCP Server    │    │  Integration    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Neo4j KG      │    │  Validation     │    │   Burr+pytest  │
│   Integration   │────│     Engine      │────│   Integration   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Validation Workflow

1. **Test Definition**: Create validation scenarios using DeepEval or custom metrics
2. **Execution**: Run tests through Playwright MCP or direct LLM APIs
3. **Monitoring**: Track performance and quality with OpenLLMetry
4. **Analysis**: Store results in Neo4j for relationship analysis
5. **TDD Cycles**: Iterate improvements using Burr+pytest workflows

## 📖 Documentation

### Framework-Specific Guides

#### DeepEval Framework
```javascript
const { DeepEvalFramework } = require('./src/services/deepeval-framework');

const framework = new DeepEvalFramework();
await framework.initialize();

const result = await framework.evaluate({
  prompt: "What is the capital of France?",
  response: "The capital of France is Paris.",
  context: "Geography question about European capitals",
  metrics: ['correctness', 'faithfulness', 'bias']
});

console.log('Evaluation Results:', result);
```

#### Playwright MCP Server
```javascript
const { PlaywrightMCPServer } = require('./src/services/playwright-mcp-server');

const server = new PlaywrightMCPServer();
await server.initialize();

const { contextId } = await server.createContext('chromium');
const { pageId } = await server.createPage(contextId);
await server.navigate(pageId, 'https://example.com');
const screenshot = await server.screenshot(pageId);
```

#### Neo4j Knowledge Graph
```javascript
const { Neo4jKnowledgeGraph } = require('./src/services/neo4j-knowledge-graph');

const kg = new Neo4jKnowledgeGraph();
await kg.initialize();

// Create test execution node
const execution = await kg.createTestExecution({
  test_id: 'test-001',
  status: 'passed',
  result_score: 0.95
});

// Analyze dependencies
const insights = await kg.getValidationInsights();
```

#### Burr+pytest TDD Workflow
```javascript
const { BurrPytestIntegration } = require('./src/services/burr-pytest-integration');

const integration = new BurrPytestIntegration();
await integration.initialize();

// Create TDD workflow
const workflow = await integration.createTDDWorkflow({
  name: 'LLM Validation Workflow',
  description: 'Test-driven LLM validation'
});

// Execute Red-Green-Refactor cycle
const redResult = await integration.executeTDDPhase(workflow.workflow_id, 'red');
const greenResult = await integration.executeTDDPhase(workflow.workflow_id, 'green');
const refactorResult = await integration.executeTDDPhase(workflow.workflow_id, 'refactor');
```

### Claude-Flow Commands

```bash
# Core system commands
./claude-flow start --ui --port 3000
./claude-flow status
./claude-flow monitor

# Agent management
./claude-flow agent spawn researcher --name validation-researcher
./claude-flow agent list

# Swarm coordination
./claude-flow swarm "Validate LLM responses for safety and accuracy" \
  --strategy validation --mode distributed --parallel --monitor

# Memory management
./claude-flow memory store validation_config "Advanced LLM validation settings"
./claude-flow memory get validation_config

# SPARC development modes
./claude-flow sparc tdd "Implement bias detection for LLM responses"
./claude-flow sparc run analyzer "Analyze test execution patterns"
```

## 🧪 Testing

### Test Suites

- **Unit Tests**: Component-level testing with Jest
- **Integration Tests**: Cross-component workflow testing
- **Performance Tests**: Load and scalability testing
- **Python Tests**: TDD workflow validation with pytest

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/deepeval/
npm test -- tests/playwright/
npm test -- tests/observability/
npm test -- tests/neo4j/
npm test -- tests/tdd/

# Run tests with coverage
npm run test:coverage

# Run Python TDD tests
cd python-tests && python -m pytest tests/
```

### Test Coverage

| Component | Coverage | Tests |
|-----------|----------|-------|
| DeepEval Framework | 92.3% | 25 tests |
| Playwright MCP | 81.2% | 35 tests |
| OpenLLMetry | 80.1% | 30 tests |
| Neo4j Knowledge Graph | 88.5% | 29 tests |
| Burr+pytest Integration | 78.3% | 36 tests |

## 📊 Monitoring & Observability

### Available Metrics

#### LLM Quality Metrics
- **Semantic**: Relevance, coherence, factual accuracy, hallucination detection
- **Syntactic**: Grammar, spelling, punctuation, structure
- **Safety**: Toxicity, bias, harmful content, privacy risk
- **Structural**: Completeness, information density, logical flow
- **Performance**: Response time, token usage, cost per request

#### System Metrics
- Request/response latencies
- Error rates and patterns
- Resource utilization
- Test execution success rates

### Health Endpoints

```bash
# Application health
curl http://localhost:3000/health

# Component-specific health
curl http://localhost:3000/health/deepeval
curl http://localhost:3000/health/playwright
curl http://localhost:3000/health/neo4j
curl http://localhost:3000/health/openllmetry
```

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration
CLAUDE_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key

# Database Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# Monitoring Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
PROMETHEUS_PORT=9090

# Python Configuration
PYTHON_PATH=python3
PYTEST_PATH=pytest
PYTEST_COVERAGE=true
PYTEST_COVERAGE_THRESHOLD=80

# Playwright Configuration
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit
PLAYWRIGHT_HEADLESS=true
```

### CLAUDE.md Configuration

The platform includes comprehensive Claude-Flow configuration in `CLAUDE.md` with:
- Build and test commands
- Claude-Flow command reference (17 SPARC modes)
- Integration patterns and workflows
- Code style preferences

## 🚀 Deployment

### Docker Deployment

```bash
# Build and start services
docker-compose up -d

# Scale validation workers
docker-compose up -d --scale validation-worker=3

# View logs
docker-compose logs -f validation-platform
```

### Production Configuration

```bash
# Production environment setup
NODE_ENV=production
LOG_LEVEL=info
ENABLE_METRICS=true
ENABLE_TRACING=true

# Security configuration
ENABLE_AUTH=true
JWT_SECRET=your_secure_jwt_secret
CORS_ORIGIN=https://your-domain.com

# Performance tuning
MAX_CONCURRENT_TESTS=10
WORKER_POOL_SIZE=4
CACHE_TTL=3600
```

## 🤝 Contributing

### Development Setup

```bash
# Install development dependencies
npm install --include=dev

# Install pre-commit hooks
npm run prepare

# Run linting and formatting
npm run lint
npm run format

# Run type checking
npm run typecheck
```

### Coding Standards

- **JavaScript/Node.js**: ES6+ with async/await patterns
- **Python**: PEP 8 compliance with type hints
- **Testing**: Comprehensive test coverage (>80%)
- **Documentation**: JSDoc for APIs, README for components

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📈 Roadmap

### Current Version (v1.0.0)
- ✅ Core validation frameworks
- ✅ Claude-Flow orchestration
- ✅ Comprehensive testing suite
- ✅ Basic monitoring and observability

### Upcoming Features (v1.1.0)
- 🔄 Advanced ML model validation
- 🔄 Distributed testing infrastructure
- 🔄 Enhanced security and compliance
- 🔄 GraphQL API interface

### Future Enhancements (v2.0.0)
- 📅 Multi-model comparison frameworks
- 📅 Automated bias detection and mitigation
- 📅 Real-time validation pipelines
- 📅 Enterprise SSO integration

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **DeepEval**: Advanced LLM evaluation framework
- **Playwright**: Modern web automation
- **OpenTelemetry**: Observability standards
- **Neo4j**: Graph database technology
- **Burr**: State machine framework
- **Claude by Anthropic**: LLM capabilities

## 📞 Support

- **Documentation**: [Wiki](https://github.com/your-org/kwality/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/kwality/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/kwality/discussions)
- **Community**: [Discord Server](https://discord.gg/kwality)

---

**Built with ❤️ for the LLM validation community**