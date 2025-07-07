const express = require('express');
const { authorize } = require('../middleware/auth');
const { query } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { NotFoundError, asyncHandler } = require('../middleware/error-handler');

const router = express.Router();

/**
 * @swagger
 * /api/knowledge-graph/nodes:
 *   get:
 *     summary: Get knowledge graph nodes
 *     tags: [Knowledge Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Knowledge graph nodes
 */
router.get('/nodes',
  asyncHandler(async (req, res) => {
    const { type, limit = 100 } = req.query;
    
    try {
      let whereClause = 'WHERE is_active = true';
      const params = [];
      
      if (type) {
        whereClause += ' AND node_type = $1';
        params.push(type);
      }
      
      const nodesResult = await query(`
        SELECT id, node_type, name, description, properties, confidence_score, created_at
        FROM knowledge_nodes
        ${whereClause}
        ORDER BY confidence_score DESC, created_at DESC
        LIMIT $${params.length + 1}
      `, [...params, limit]);
      
      res.json({
        nodes: nodesResult.rows
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_knowledge_nodes',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/knowledge-graph/relationships:
 *   get:
 *     summary: Get knowledge graph relationships
 *     tags: [Knowledge Graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Knowledge graph relationships
 */
router.get('/relationships',
  asyncHandler(async (req, res) => {
    const { node_id, relationship_type, limit = 100 } = req.query;
    
    try {
      let whereClause = 'WHERE kr.is_active = true';
      const params = [];
      let paramIndex = 1;
      
      if (node_id) {
        whereClause += ` AND (kr.source_node_id = $${paramIndex} OR kr.target_node_id = $${paramIndex})`;
        params.push(node_id);
        paramIndex++;
      }
      
      if (relationship_type) {
        whereClause += ` AND kr.relationship_type = $${paramIndex}`;
        params.push(relationship_type);
        paramIndex++;
      }
      
      const relationshipsResult = await query(`
        SELECT 
          kr.*,
          sn.name as source_name,
          sn.node_type as source_type,
          tn.name as target_name,
          tn.node_type as target_type
        FROM knowledge_relationships kr
        JOIN knowledge_nodes sn ON kr.source_node_id = sn.id
        JOIN knowledge_nodes tn ON kr.target_node_id = tn.id
        ${whereClause}
        ORDER BY kr.confidence_score DESC, kr.created_at DESC
        LIMIT $${paramIndex}
      `, [...params, limit]);
      
      res.json({
        relationships: relationshipsResult.rows
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_knowledge_relationships',
        userId: req.user.id
      });
      throw error;
    }
  })
);

module.exports = router;