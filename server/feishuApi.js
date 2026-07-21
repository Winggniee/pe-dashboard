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
          // Get all table records, following pagination (Feishu caps page_size at 500,
          // but tables can have more records than that, so page_token is followed until
          // has_more is false).
          let records = [];
          let pageToken = null;
          do {
            const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${table.table_id}/records` +
              `?page_size=500&automatic_fields=true` +
              (pageToken ? `&page_token=${pageToken}` : '');

            const recordsResponse = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            const recordsJson = await recordsResponse.json();

            if (recordsJson.code !== 0) {
              console.error(`Failed to get records for table ${table.table_id}:`, recordsJson.msg);
              break;
            }

            records = records.concat(recordsJson.data?.items || []);
            pageToken = recordsJson.data?.has_more ? recordsJson.data.page_token : null;
          } while (pageToken);

          return {
            tableId: table.table_id,
            tableName: table.name,
            records
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

// Resolves a Feishu Wiki node token (from a URL like .../wiki/<nodeToken>?table=...)
// to the underlying Bitable app_token. Wiki-embedded bases have a different
// app_token than the node_token shown in the browser URL.
async function resolveWikiNodeAppToken(token, nodeToken) {
  const response = await fetch(`${FEISHU_API_BASE}/wiki/v2/spaces/get_node?token=${nodeToken}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Failed to resolve wiki node ${nodeToken}: ${data.msg}`);
  }

  const node = data.data?.node;

  if (!node || node.obj_type !== 'bitable') {
    throw new Error(`Wiki node ${nodeToken} is not a bitable (obj_type: ${node?.obj_type})`);
  }

  return node.obj_token;
}

// Fetches ALL records (with pagination) for a single specific table, given its
// app_token and table_id directly (no metadata/table-listing calls needed).
// Used for data sources that are a single dedicated table, like the PE Gantt
// change-history log, rather than "sync every table in this base".
async function getTableRecords(token, appToken, tableId) {
  let records = [];
  let pageToken = null;

  do {
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records` +
      `?page_size=500&automatic_fields=true` +
      (pageToken ? `&page_token=${pageToken}` : '');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const json = await response.json();

    if (json.code !== 0) {
      throw new Error(`Failed to fetch records for table ${tableId}: ${json.msg}`);
    }

    records = records.concat(json.data?.items || []);
    pageToken = json.data?.has_more ? json.data.page_token : null;
  } while (pageToken);

  return records;
}

module.exports = {
  getAccessToken,
  getBitable,
  resolveWikiNodeAppToken,
  getTableRecords
};
