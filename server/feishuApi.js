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

// Get document content
async function getDocument(token, documentId) {
  try {
    // Get document metadata
    const metaResponse = await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${documentId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const metaData = await metaResponse.json();
    
    if (metaData.code !== 0) {
      console.error(`Failed to get document ${documentId}:`, metaData.msg);
      return null;
    }

    // Get document content
    const contentResponse = await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${documentId}/raw_content`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const contentData = await contentResponse.json();

    return {
      id: documentId,
      title: metaData.data?.document?.title || 'Untitled',
      content: contentData.data?.content || '',
      type: 'document',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching document ${documentId}:`, error);
    return null;
  }
}

// Get spreadsheet data
async function getSpreadsheet(token, spreadsheetId) {
  try {
    // Get spreadsheet metadata
    const metaResponse = await fetch(`${FEISHU_API_BASE}/sheets/v3/spreadsheets/${spreadsheetId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const metaData = await metaResponse.json();
    
    if (metaData.code !== 0) {
      console.error(`Failed to get spreadsheet ${spreadsheetId}:`, metaData.msg);
      return null;
    }

    const spreadsheet = metaData.data?.spreadsheet;
    const sheets = spreadsheet?.sheets || [];

    // Get data from all sheets
    const sheetsData = await Promise.all(
      sheets.map(async (sheet) => {
        try {
          const dataResponse = await fetch(
            `${FEISHU_API_BASE}/sheets/v2/spreadsheets/${spreadsheetId}/values/${sheet.sheet_id}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          const dataJson = await dataResponse.json();
          
          return {
            sheetId: sheet.sheet_id,
            title: sheet.title,
            data: dataJson.data?.valueRange?.values || []
          };
        } catch (error) {
          console.error(`Error fetching sheet ${sheet.sheet_id}:`, error);
          return {
            sheetId: sheet.sheet_id,
            title: sheet.title,
            data: []
          };
        }
      })
    );

    return {
      id: spreadsheetId,
      title: spreadsheet?.title || 'Untitled Spreadsheet',
      sheets: sheetsData,
      type: 'spreadsheet',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching spreadsheet ${spreadsheetId}:`, error);
    return null;
  }
}

// Get wiki page content
async function getWikiPage(token, nodeToken) {
  try {
    // The nodeToken from URLs like /wiki/KLivwayNai46IYk7ZQicUSsxn9e is actually a node_token
    // We need to use a different API to get node info
    
    // Try to get the node directly - this requires knowing the space_id which we don't have
    // Alternative: treat it as a regular document since wikis are often based on docs
    
    try {
      // First, try as a regular docx document
      const docResponse = await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${nodeToken}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const docMeta = await docResponse.json();
      
      if (docMeta.code === 0) {
        // Get raw content
        const contentResponse = await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${nodeToken}/raw_content`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const contentData = await contentResponse.json();
        
        return {
          id: nodeToken,
          title: docMeta.data?.document?.title || 'Untitled Wiki Document',
          content: contentData.data?.content || '',
          type: 'wiki',
          objType: 'docx',
          lastUpdated: new Date().toISOString()
        };
      } else {
        console.error(`Could not fetch wiki as document: ${docMeta.msg}`);
      }
    } catch (docErr) {
      console.error('Error treating wiki as document:', docErr.message);
    }
    
    // If document approach fails, return a placeholder
    return {
      id: nodeToken,
      title: 'Wiki页面',
      content: `Wiki节点ID: ${nodeToken}\n\n注意：此Wiki页面可能需要特殊权限或使用不同的API端点访问。请确保：\n1. 应用已获得wiki:wiki权限\n2. 该Wiki页面已分享给应用\n3. ID格式正确`,
      type: 'wiki',
      objType: 'wiki_node',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching wiki page ${nodeToken}:`, error);
    return null;
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

// Get user avatar URL
async function getUserAvatar(token, userId) {
  try {
    const response = await fetch(`${FEISHU_API_BASE}/contact/v3/users/${userId}?user_id_type=user_id`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      console.error(`Failed to get user avatar for ${userId}:`, data.msg);
      return null;
    }

    return data.data?.user?.avatar?.avatar_240 || data.data?.user?.avatar?.avatar_72 || null;
  } catch (error) {
    console.error(`Error fetching user avatar ${userId}:`, error);
    return null;
  }
}

module.exports = {
  getAccessToken,
  getDocument,
  getSpreadsheet,
  getWikiPage,
  getBitable,
  getUserAvatar
};
