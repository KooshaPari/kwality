const logger = require('../utils/logger');

/**
 * Validation Metrics Manager
 * Collects and manages validation performance metrics
 */
class ValidationMetrics {
  constructor() {
    this.metrics = {
      executions: {
        total: 0,
        successful: 0,
        failed: 0,
        errors: 0,
        byType: {}
      },
      performance: {
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        byType: {}
      },
      quality: {
        totalScore: 0,
        averageScore: 0,
        minScore: Infinity,
        maxScore: 0,
        byType: {}
      },
      trends: {
        hourly: new Map(),
        daily: new Map(),
        weekly: new Map()
      }
    };
    
    this.startTime = Date.now();
    this.resetInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.setupPeriodicReset();
  }

  /**
   * Record a validation execution
   */
  recordExecution(type, status, executionTime, score = null) {
    const timestamp = Date.now();
    
    // Update execution counts
    this.metrics.executions.total++;
    this.metrics.executions[status] = (this.metrics.executions[status] || 0) + 1;
    
    // Update by type
    if (!this.metrics.executions.byType[type]) {
      this.metrics.executions.byType[type] = {
        total: 0,
        successful: 0,
        failed: 0,
        errors: 0
      };
    }
    this.metrics.executions.byType[type].total++;
    this.metrics.executions.byType[type][status] = (this.metrics.executions.byType[type][status] || 0) + 1;
    
    // Update performance metrics
    this.updatePerformanceMetrics(type, executionTime);
    
    // Update quality metrics if score is provided
    if (score !== null) {
      this.updateQualityMetrics(type, score);
    }
    
    // Update trends
    this.updateTrends(timestamp, type, status, executionTime, score);
    
    logger.debug('Validation execution recorded', {
      type,
      status,
      executionTime,
      score,
      timestamp
    });
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(type, executionTime) {
    // Global performance metrics
    this.metrics.performance.totalExecutionTime += executionTime;
    this.metrics.performance.averageExecutionTime = 
      this.metrics.performance.totalExecutionTime / this.metrics.executions.total;
    this.metrics.performance.minExecutionTime = 
      Math.min(this.metrics.performance.minExecutionTime, executionTime);
    this.metrics.performance.maxExecutionTime = 
      Math.max(this.metrics.performance.maxExecutionTime, executionTime);
    
    // Type-specific performance metrics
    if (!this.metrics.performance.byType[type]) {
      this.metrics.performance.byType[type] = {
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        executionCount: 0
      };
    }
    
    const typeMetrics = this.metrics.performance.byType[type];
    typeMetrics.totalExecutionTime += executionTime;
    typeMetrics.executionCount++;
    typeMetrics.averageExecutionTime = typeMetrics.totalExecutionTime / typeMetrics.executionCount;
    typeMetrics.minExecutionTime = Math.min(typeMetrics.minExecutionTime, executionTime);
    typeMetrics.maxExecutionTime = Math.max(typeMetrics.maxExecutionTime, executionTime);
  }

  /**
   * Update quality metrics
   */
  updateQualityMetrics(type, score) {
    // Global quality metrics
    this.metrics.quality.totalScore += score;
    
    const executionsWithScore = this.metrics.executions.total;
    this.metrics.quality.averageScore = this.metrics.quality.totalScore / executionsWithScore;
    this.metrics.quality.minScore = Math.min(this.metrics.quality.minScore, score);
    this.metrics.quality.maxScore = Math.max(this.metrics.quality.maxScore, score);
    
    // Type-specific quality metrics
    if (!this.metrics.quality.byType[type]) {
      this.metrics.quality.byType[type] = {
        totalScore: 0,
        averageScore: 0,
        minScore: Infinity,
        maxScore: 0,
        scoreCount: 0
      };
    }
    
    const typeMetrics = this.metrics.quality.byType[type];
    typeMetrics.totalScore += score;
    typeMetrics.scoreCount++;
    typeMetrics.averageScore = typeMetrics.totalScore / typeMetrics.scoreCount;
    typeMetrics.minScore = Math.min(typeMetrics.minScore, score);
    typeMetrics.maxScore = Math.max(typeMetrics.maxScore, score);
  }

  /**
   * Update trend metrics
   */
  updateTrends(timestamp, type, status, executionTime, score) {
    const hour = new Date(timestamp).getHours();
    const day = new Date(timestamp).getDate();
    const week = Math.floor((timestamp - this.startTime) / (7 * 24 * 60 * 60 * 1000));
    
    // Hourly trends
    if (!this.metrics.trends.hourly.has(hour)) {
      this.metrics.trends.hourly.set(hour, this.createTrendEntry());
    }
    this.updateTrendEntry(this.metrics.trends.hourly.get(hour), type, status, executionTime, score);
    
    // Daily trends
    if (!this.metrics.trends.daily.has(day)) {
      this.metrics.trends.daily.set(day, this.createTrendEntry());
    }
    this.updateTrendEntry(this.metrics.trends.daily.get(day), type, status, executionTime, score);
    
    // Weekly trends
    if (!this.metrics.trends.weekly.has(week)) {
      this.metrics.trends.weekly.set(week, this.createTrendEntry());
    }
    this.updateTrendEntry(this.metrics.trends.weekly.get(week), type, status, executionTime, score);
  }

  /**
   * Create a new trend entry
   */
  createTrendEntry() {
    return {
      executions: 0,
      successful: 0,
      failed: 0,
      errors: 0,
      totalExecutionTime: 0,
      totalScore: 0,
      scoreCount: 0
    };
  }

  /**
   * Update a trend entry
   */
  updateTrendEntry(entry, type, status, executionTime, score) {
    entry.executions++;
    entry[status] = (entry[status] || 0) + 1;
    entry.totalExecutionTime += executionTime;
    
    if (score !== null) {
      entry.totalScore += score;
      entry.scoreCount++;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      lastReset: this.startTime
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    
    return {
      totalExecutions: metrics.executions.total,
      successRate: metrics.executions.total > 0 ? 
        (metrics.executions.successful / metrics.executions.total) * 100 : 0,
      errorRate: metrics.executions.total > 0 ? 
        (metrics.executions.errors / metrics.executions.total) * 100 : 0,
      averageExecutionTime: metrics.performance.averageExecutionTime,
      averageScore: metrics.quality.averageScore,
      uptime: metrics.uptime
    };
  }

  /**
   * Get metrics by type
   */
  getMetricsByType(type) {
    return {
      executions: this.metrics.executions.byType[type] || {},
      performance: this.metrics.performance.byType[type] || {},
      quality: this.metrics.quality.byType[type] || {}
    };
  }

  /**
   * Get trend data
   */
  getTrends(period = 'hourly') {
    const trends = this.metrics.trends[period];
    if (!trends) {
      return [];
    }
    
    return Array.from(trends.entries()).map(([key, data]) => ({
      period: key,
      executions: data.executions,
      successRate: data.executions > 0 ? (data.successful / data.executions) * 100 : 0,
      averageExecutionTime: data.executions > 0 ? data.totalExecutionTime / data.executions : 0,
      averageScore: data.scoreCount > 0 ? data.totalScore / data.scoreCount : 0
    }));
  }

  /**
   * Get top performing types
   */
  getTopPerformingTypes(limit = 5) {
    const types = Object.keys(this.metrics.executions.byType);
    
    return types
      .map(type => ({
        type,
        executions: this.metrics.executions.byType[type].total,
        successRate: this.metrics.executions.byType[type].total > 0 ? 
          (this.metrics.executions.byType[type].successful / this.metrics.executions.byType[type].total) * 100 : 0,
        averageExecutionTime: this.metrics.performance.byType[type]?.averageExecutionTime || 0,
        averageScore: this.metrics.quality.byType[type]?.averageScore || 0
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  /**
   * Get alerts based on metrics
   */
  getAlerts() {
    const alerts = [];
    const summary = this.getPerformanceSummary();
    
    // High error rate alert
    if (summary.errorRate > 10) {
      alerts.push({
        type: 'error',
        message: `High error rate: ${summary.errorRate.toFixed(2)}%`,
        threshold: 10,
        current: summary.errorRate
      });
    }
    
    // Low success rate alert
    if (summary.successRate < 80) {
      alerts.push({
        type: 'warning',
        message: `Low success rate: ${summary.successRate.toFixed(2)}%`,
        threshold: 80,
        current: summary.successRate
      });
    }
    
    // High execution time alert
    if (summary.averageExecutionTime > 5000) { // 5 seconds
      alerts.push({
        type: 'warning',
        message: `High average execution time: ${summary.averageExecutionTime.toFixed(2)}ms`,
        threshold: 5000,
        current: summary.averageExecutionTime
      });
    }
    
    // Low quality score alert
    if (summary.averageScore < 70) {
      alerts.push({
        type: 'warning',
        message: `Low average score: ${summary.averageScore.toFixed(2)}`,
        threshold: 70,
        current: summary.averageScore
      });
    }
    
    return alerts;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      executions: {
        total: 0,
        successful: 0,
        failed: 0,
        errors: 0,
        byType: {}
      },
      performance: {
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        byType: {}
      },
      quality: {
        totalScore: 0,
        averageScore: 0,
        minScore: Infinity,
        maxScore: 0,
        byType: {}
      },
      trends: {
        hourly: new Map(),
        daily: new Map(),
        weekly: new Map()
      }
    };
    
    this.startTime = Date.now();
    logger.info('Validation metrics reset');
  }

  /**
   * Setup periodic reset
   */
  setupPeriodicReset() {
    setInterval(() => {
      this.resetMetrics();
    }, this.resetInterval);
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics() {
    const metrics = this.getMetrics();
    
    // Convert Maps to objects for JSON serialization
    const exportData = {
      ...metrics,
      trends: {
        hourly: Object.fromEntries(metrics.trends.hourly),
        daily: Object.fromEntries(metrics.trends.daily),
        weekly: Object.fromEntries(metrics.trends.weekly)
      }
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}

module.exports = { ValidationMetrics };