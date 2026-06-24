// Vercel serverless function wrapper
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const feishuApi = require('../server/feishuApi');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store
let dataStore = {
  documents: [],
  sheets: [],
  wikis: [],
  bitables: [],
  lastSync: null
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    lastSync: dataStore.lastSync,
    documentsCount: dataStore.documents.length,
    sheetsCount: dataStore.sheets.length,
    wikisCount: dataStore.wikis.length,
    bitablesCount: dataStore.bitables.length
  });
});

// Get all bitables
app.get('/api/bitables', (req, res) => {
  res.json(dataStore.bitables);
});

// PE Statistics endpoint
app.get('/api/pe-stats', async (req, res) => {
  try {
    const peStats = {};
    const statusStats = {};
    
    // Get access token for fetching user avatars
    const token = await feishuApi.getAccessToken();
    
    // Define difficulty level weights for workload calculation
    const difficultyWeights = {
      '简单': 1,
      '中等': 2,
      '困难': 3,
      '非常困难': 4,
      '高难项目': 4
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
          
          // Get project difficulty level
          const difficultyLevel = fields['项目难度等级'] || '中等';
          const difficultyWeight = difficultyWeights[difficultyLevel] || 2;
          
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
                avatar: null,
                projectCount: 0,
                workload: 0,
                projects: [],
                statusBreakdown: {}
              };
            }
            
            peStats[peName].projectCount++;
            peStats[peName].workload += difficultyWeight;
            peStats[peName].projects.push({
              name: projectName,
              status: customerStatus,
              difficulty: difficultyLevel,
              difficultyWeight: difficultyWeight,
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

// Initial sync
performSync().catch(err => {
  console.error('Initial sync failed:', err);
});

// Export for Vercel
module.exports = app;
