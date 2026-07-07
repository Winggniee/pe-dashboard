const fetch = require('node-fetch');

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// Get tenant access token
async function getAccessToken() {
  try {
    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.FEISHU_APP_ID,
        app_secret: process.env.FEISHU_APP_SECRET
      })
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`Failed to get access token: ${data.msg}`);
    }

    return data.tenant_access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

// Get bitable (multi-dimensional table) data
async function getBitable(token, appToken, tableId = null) {
  try {
    // Get bitable metadata
    const metaResponse = await fetch(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const metaData = await metaResponse.json();
    
    if (metaData.code !== 0) {
      console.error(`Failed to get bitable ${appToken}:`, metaData.msg);
      return null;
    }

    const app = metaData.data?.app;

    // Get list of tables
    const tablesResponse = await fetch(`${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const tablesData = await tablesResponse.json();
    
    if (tablesData.code !== 0) {
      console.error(`Failed to get bitable tables:`, tablesData.msg);
      return null;
    }

    const tables = tablesData.data?.items || [];
    
    // Get data from each table (limit to first 3 tables for performance)
    const tablesToFetch = tableId 
      ? tables.filter(t => t.table_id === tableId)
      : tables.slice(0, 3);

    const tablesDataArray = await Promise.all(
      tablesToFetch.map(async (table) => {
        try {
          // Get table records
          const recordsResponse = await fetch(
            `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${table.table_id}/records?page_size=100`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          const recordsJson = await recordsResponse.json();
          
          return {
            tableId: table.table_id,
            tableName: table.name,
            records: recordsJson.data?.items || []
          };
        } catch (error) {
          console.error(`Error fetching table ${table.table_id}:`, error);
          return {
            tableId: table.table_id,
            tableName: table.name,
            records: []
          };
        }
      })
    );

    return {
      id: appToken,
      title: app?.name || 'Untitled Bitable',
      tables: tablesDataArray,
      type: 'bitable',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching bitable ${appToken}:`, error);
    return null;
  }
}

module.exports = {
  getAccessToken,
  getBitable
};
