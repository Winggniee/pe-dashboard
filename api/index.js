// Vercel serverless function wrapper
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const feishuApi = require('../server/feishuApi');
const ganttService = require('../server/ganttService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store
let dataStore = {
  bitables: [],
  lastSync: null
};

// Vercel serverless functions don't share memory across invocations/instances —
// a "cold" instance always starts with an empty dataStore. The module-level
// performSync() call below fires on cold start, but if a request lands before
// it finishes (or on a different instance that hasn't synced at all), the API
// would return empty results. This tracks the in-flight sync promise so any
// route can await it instead of assuming dataStore is already populated.
let syncPromise = performSync().catch(err => {
  console.error('Initial sync failed:', err);
});

// Ensures dataStore has data before answering a request. Cheap no-op once a
// sync has completed and dataStore is populated; otherwise awaits the
// in-flight sync (reusing the same promise so concurrent cold requests don't
// each trigger their own redundant sync).
async function ensureSynced() {
  if (dataStore.bitables.length > 0) return;
  if (!syncPromise) {
    syncPromise = performSync().catch(err => {
      console.error('On-demand sync failed:', err);
    });
  }
  await syncPromise;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    lastSync: dataStore.lastSync,
    bitablesCount: dataStore.bitables.length
  });
});

// Get all bitables
app.get('/api/bitables', async (req, res) => {
  await ensureSynced();
  res.json(dataStore.bitables);
});

// PE Statistics endpoint
app.get('/api/pe-stats', async (req, res) => {
  try {
    await ensureSynced();

    const peStats = {};
    const statusStats = {};
    
    // Get user-adjustable weights from query params (with defaults)
    const difficultyWeights = {
      '高难项目': parseFloat(req.query.difficultWeight || 3),
      '中等项目': parseFloat(req.query.mediumWeight || 2),
      '简单项目': parseFloat(req.query.easyWeight || 1),
      // Fallback for other naming conventions
      '困难': parseFloat(req.query.difficultWeight || 3),
      '中等': parseFloat(req.query.mediumWeight || 2),
      '简单': parseFloat(req.query.easyWeight || 1),
      '非常困难': parseFloat(req.query.difficultWeight || 3)
    };
    
    // Customer status workload multipliers
    const statusMultipliers = {
      '维护中': parseFloat(req.query.maintainMultiplier || 1.0),
      '调优中': parseFloat(req.query.optimizeMultiplier || 1.5),
      '搭建中': parseFloat(req.query.buildMultiplier || 1.5),
      '测试中': parseFloat(req.query.testMultiplier || 1.0),
      '等待中（等商务）': parseFloat(req.query.waitBusinessMultiplier || 0.3),
      '等待中（等客户）': parseFloat(req.query.waitClientMultiplier || 0.3),
      '未知状态': parseFloat(req.query.unknownMultiplier || 0.5),
      '封号': parseFloat(req.query.bannedMultiplier || 0.1),
      '已流失': parseFloat(req.query.lostMultiplier || 0.1)
    };
    
    // Process all bitables
    dataStore.bitables.forEach(bitable => {
      bitable.tables.forEach(table => {
        table.records.forEach(record => {
          const fields = record.fields;
          
          // Get PE information
          const peArray = fields['PE'] || fields['负责PE'] || [];
          const projectName = fields['项目名称'] || fields['项目'] || '未命名项目';
          const customerStatus = fields['客户状态'] || '未知状态';
          
          // Skip inactive/closed projects — 封号/客户封号 are the same concept with
          // two different exact strings used across tables ("当前项目" uses 客户封号,
          // "2026" uses 封号), so both are checked explicitly.
          const INACTIVE_STATUSES = ['封号', '客户封号', '已流失', '项目暂停', '已移交'];
          if (INACTIVE_STATUSES.includes(customerStatus)) {
            return; // Skip this project
          }
          
          // Get project difficulty level
          const difficultyLevel = fields['项目难度等级'] || '中等项目';
          const difficultyWeight = difficultyWeights[difficultyLevel] || difficultyWeights['中等项目'] || 2;
          
          // Get status multiplier
          const statusMultiplier = statusMultipliers[customerStatus] || 1.0;
          
          // Calculate weighted workload: difficulty × status multiplier
          const projectWorkload = difficultyWeight * statusMultiplier;
          
          // Count customer status
          if (!statusStats[customerStatus]) {
            statusStats[customerStatus] = 0;
          }
          statusStats[customerStatus]++;
          
          // Process each PE in the record
          peArray.forEach(pe => {
            const peName = pe.name || pe.en_name || 'Unknown PE';
            
            if (!peStats[peName]) {
              peStats[peName] = {
                name: peName,
                email: pe.email || '',
                id: pe.id || '',
                projectCount: 0,
                workload: 0,  // Total weighted workload score
                projects: [],
                statusBreakdown: {}
              };
            }
            
            peStats[peName].projectCount++;
            peStats[peName].workload += projectWorkload;
            peStats[peName].projects.push({
              name: projectName,
              status: customerStatus,
              difficulty: difficultyLevel,
              difficultyWeight: difficultyWeight,
              statusMultiplier: statusMultiplier,
              projectWorkload: projectWorkload,
              recordId: record.record_id
            });
            
            // Track status breakdown per PE
            if (!peStats[peName].statusBreakdown[customerStatus]) {
              peStats[peName].statusBreakdown[customerStatus] = 0;
            }
            peStats[peName].statusBreakdown[customerStatus]++;
          });
        });
      });
    });
    
    // Sort by project count
    const statsArray = Object.values(peStats);
    statsArray.sort((a, b) => b.projectCount - a.projectCount);
    
    // Convert status stats to array for charting
    const statusArray = Object.entries(statusStats).map(([status, count]) => ({
      status,
      count,
      percentage: ((count / Object.values(statusStats).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
    })).sort((a, b) => b.count - a.count);
    
    res.json({
      totalPEs: statsArray.length,
      totalProjects: statsArray.reduce((sum, pe) => sum + pe.projectCount, 0),
      totalWorkload: statsArray.reduce((sum, pe) => sum + pe.workload, 0),
      peStats: statsArray,
      statusStats: statusArray,
      lastSync: dataStore.lastSync
    });
  } catch (error) {
    console.error('Error generating PE stats:', error);
    res.status(500).json({ error: 'Failed to generate PE statistics' });
  }
});

// PE 个人项目维度甘特图 data endpoint.
// Reads exclusively from the dedicated 变更历史记录表 configured via
// FEISHU_GANTT_WIKI_NODE / FEISHU_GANTT_TABLE_ID — independent of dataStore /
// FEISHU_BITABLE_IDS used by the rest of the dashboard.
app.get('/api/pe-gantt', async (req, res) => {
  try {
    const gantt = await ganttService.buildGanttData();
    res.json(gantt);
  } catch (error) {
    console.error('Error generating Gantt data:', error);
    res.status(500).json({ error: error.message || 'Failed to generate Gantt data' });
  }
});

// Manual sync trigger
app.post('/api/sync', async (req, res) => {
  try {
    console.log('Manual sync triggered...');
    await performSync();
    res.json({ 
      success: true, 
      message: 'Sync completed',
      lastSync: dataStore.lastSync
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Perform sync operation
async function performSync() {
  try {
    console.log('Starting sync...');
    
    // Get access token
    const token = await feishuApi.getAccessToken();
    
    // Sync bitables
    const bitableIds = process.env.FEISHU_BITABLE_IDS?.split(',').filter(id => id.trim());
    if (bitableIds && bitableIds.length > 0) {
      const bitables = await Promise.all(
        bitableIds.map(id => {
          const [appToken, tableId] = id.trim().split(':');
          return feishuApi.getBitable(token, appToken, tableId || null);
        })
      );
      dataStore.bitables = bitables.filter(bitable => bitable !== null);
    }
    
    dataStore.lastSync = new Date().toISOString();
    console.log('Sync completed successfully');
  } catch (error) {
    console.error('Error during sync:', error);
    throw error;
  }
}

// Export for Vercel
module.exports = app;
