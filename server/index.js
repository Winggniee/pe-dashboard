const express = require('express');
const cors = require('cors');
require('dotenv').config();
const feishuApi = require('./feishuApi');
const syncService = require('./syncService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store (consider using a database for production)
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

// Get all documents
app.get('/api/documents', (req, res) => {
  res.json(dataStore.documents);
});

// Get all sheets
app.get('/api/sheets', (req, res) => {
  res.json(dataStore.sheets);
});

// Get all wikis
app.get('/api/wikis', (req, res) => {
  res.json(dataStore.wikis);
});

// Get all bitables
app.get('/api/bitables', (req, res) => {
  res.json(dataStore.bitables);
});

// Get single document by ID
app.get('/api/documents/:id', (req, res) => {
  const doc = dataStore.documents.find(d => d.id === req.params.id);
  if (doc) {
    res.json(doc);
  } else {
    res.status(404).json({ error: 'Document not found' });
  }
});

// Get single sheet by ID
app.get('/api/sheets/:id', (req, res) => {
  const sheet = dataStore.sheets.find(s => s.id === req.params.id);
  if (sheet) {
    res.json(sheet);
  } else {
    res.status(404).json({ error: 'Sheet not found' });
  }
});

// Get single wiki by ID
app.get('/api/wikis/:id', (req, res) => {
  const wiki = dataStore.wikis.find(w => w.id === req.params.id);
  if (wiki) {
    res.json(wiki);
  } else {
    res.status(404).json({ error: 'Wiki not found' });
  }
});

// Get single bitable by ID
app.get('/api/bitables/:id', (req, res) => {
  const bitable = dataStore.bitables.find(b => b.id === req.params.id);
  if (bitable) {
    res.json(bitable);
  } else {
    res.status(404).json({ error: 'Bitable not found' });
  }
});

// Debug endpoint to see raw data
app.get('/api/debug/data', (req, res) => {
  res.json({
    documents: dataStore.documents,
    sheets: dataStore.sheets,
    wikis: dataStore.wikis,
    bitables: dataStore.bitables,
    lastSync: dataStore.lastSync
  });
});

// PE Statistics endpoint
app.get('/api/pe-stats', async (req, res) => {
  try {
    const peStats = {};
    const statusStats = {};
    
    // Get access token for fetching user avatars
    const token = await feishuApi.getAccessToken();
    
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
          
          // Skip inactive projects (封号 and 已流失)
          if (customerStatus === '封号' || customerStatus === '已流失') {
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
                avatar: null,  // Will be fetched below
                projectCount: 0,
                workload: 0,  // Total weighted workload score
                rawWorkload: 0,  // Raw difficulty sum (for reference)
                projects: [],
                statusBreakdown: {}
              };
            }
            
            peStats[peName].projectCount++;
            peStats[peName].workload += projectWorkload;
            peStats[peName].rawWorkload += difficultyWeight;
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
    
    // Fetch avatars for all PEs
    const statsArray = Object.values(peStats);
    console.log(`Fetching avatars for ${statsArray.length} PEs...`);
    await Promise.all(
      statsArray.map(async (pe) => {
        if (pe.id) {
          try {
            pe.avatar = await feishuApi.getUserAvatar(token, pe.id);
            console.log(`Avatar for ${pe.name}: ${pe.avatar ? 'Found' : 'Not found'}`);
          } catch (error) {
            console.error(`Failed to fetch avatar for ${pe.name}:`, error.message);
          }
        } else {
          console.log(`No user ID for ${pe.name}, skipping avatar fetch`);
        }
      })
    );
    
    // Sort by project count
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
      totalRawWorkload: statsArray.reduce((sum, pe) => sum + pe.rawWorkload, 0),
      peStats: statsArray,
      statusStats: statusArray,
      lastSync: dataStore.lastSync,
      appliedWeights: {
        difficulty: {
          '高难项目': difficultyWeights['高难项目'],
          '中等项目': difficultyWeights['中等项目'],
          '简单项目': difficultyWeights['简单项目']
        },
        statusMultipliers: statusMultipliers
      }
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
    
    // Sync documents
    const documentIds = process.env.FEISHU_DOCUMENT_IDS?.split(',').filter(id => id.trim());
    if (documentIds && documentIds.length > 0) {
      const documents = await Promise.all(
        documentIds.map(id => feishuApi.getDocument(token, id.trim()))
      );
      dataStore.documents = documents.filter(doc => doc !== null);
    }
    
    // Sync sheets
    const sheetIds = process.env.FEISHU_SHEET_IDS?.split(',').filter(id => id.trim());
    if (sheetIds && sheetIds.length > 0) {
      const sheets = await Promise.all(
        sheetIds.map(id => feishuApi.getSpreadsheet(token, id.trim()))
      );
      dataStore.sheets = sheets.filter(sheet => sheet !== null);
    }
    
    // Sync wiki pages
    const wikiIds = process.env.FEISHU_WIKI_IDS?.split(',').filter(id => id.trim());
    if (wikiIds && wikiIds.length > 0) {
      const wikis = await Promise.all(
        wikiIds.map(id => feishuApi.getWikiPage(token, id.trim()))
      );
      dataStore.wikis = wikis.filter(wiki => wiki !== null);
    }
    
    // Sync bitables
    const bitableIds = process.env.FEISHU_BITABLE_IDS?.split(',').filter(id => id.trim());
    if (bitableIds && bitableIds.length > 0) {
      const bitables = await Promise.all(
        bitableIds.map(id => {
          // Support format: appToken or appToken:tableId
          const [appToken, tableId] = id.trim().split(':');
          return feishuApi.getBitable(token, appToken, tableId || null);
        })
      );
      dataStore.bitables = bitables.filter(bitable => bitable !== null);
    }
    
    dataStore.lastSync = new Date().toISOString();
    console.log('Sync completed successfully');
    console.log(`Documents: ${dataStore.documents.length}, Sheets: ${dataStore.sheets.length}, Wikis: ${dataStore.wikis.length}, Bitables: ${dataStore.bitables.length}`);
  } catch (error) {
    console.error('Error during sync:', error);
    throw error;
  }
}

// Initialize sync service
syncService.startAutoSync(performSync);

// Initial sync on startup
performSync().catch(err => {
  console.error('Initial sync failed:', err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Sync interval: ${process.env.SYNC_INTERVAL || 5} minutes`);
});
