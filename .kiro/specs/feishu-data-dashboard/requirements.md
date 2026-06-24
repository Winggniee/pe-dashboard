# Requirements Document

## Introduction

飞书数据同步仪表板（Feishu Data Dashboard）是一个 Web 应用程序，用于从飞书（Feishu/Lark）开放平台获取文档和电子表格数据，并在网页界面上以清晰、有组织的方式展示这些数据。系统提供自动同步机制，确保展示的数据始终与飞书中的源数据保持一致，同时支持用户手动触发同步操作。

## Glossary

- **Dashboard**: 飞书数据同步仪表板系统，整个 Web 应用程序
- **Feishu_API**: 飞书开放平台 API，用于访问飞书文档和电子表格数据
- **Access_Token**: 飞书 API 访问令牌，用于认证 API 请求
- **Document**: 飞书文档（docx 格式），包含标题和文本内容
- **Spreadsheet**: 飞书电子表格，包含一个或多个工作表（Sheet）
- **Sheet**: 电子表格中的单个工作表，包含二维数据
- **Sync_Service**: 数据同步服务，负责从飞书 API 获取数据并更新本地数据存储
- **Data_Store**: 本地数据存储，保存从飞书同步的文档和电子表格数据
- **Frontend**: React 前端应用，负责展示数据和用户交互
- **Backend**: Express 后端服务器，负责 API 集成和数据同步
- **Manual_Sync**: 用户主动触发的同步操作
- **Auto_Sync**: 系统按照配置的时间间隔自动执行的同步操作

## Requirements

### Requirement 1: 飞书 API 认证

**User Story:** 作为系统管理员，我希望系统能够安全地获取飞书 API 访问令牌，以便系统可以访问飞书平台上的文档和电子表格数据。

#### Acceptance Criteria

1. WHEN THE Backend starts, THE Backend SHALL load App_ID from the FEISHU_APP_ID environment variable and App_Secret from the FEISHU_APP_SECRET environment variable
2. WHEN THE Backend loads credentials from environment variables, THE Backend SHALL validate that both App_ID and App_Secret are non-empty strings
3. IF either App_ID or App_Secret is missing or empty, THEN THE Backend SHALL log an error message and throw an exception
4. WHEN THE Backend requests an access token from Feishu_API, THE Backend SHALL send App_ID and App_Secret to the token endpoint at https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
5. WHEN Feishu_API returns a response with code 0, THE Backend SHALL store the tenant_access_token field for subsequent API requests
6. WHEN THE Backend stores an access token, THE Backend SHALL keep the token in memory for reuse across API requests
7. IF Feishu_API returns a response with code not equal to 0, THEN THE Backend SHALL log the error message from the msg field and throw an exception
8. WHEN THE Backend receives an authentication error during an API call, THE Backend SHALL request a new access token before retrying the failed API call

### Requirement 2: 文档数据同步

**User Story:** 作为用户，我希望系统能够从飞书获取文档内容，以便我可以在仪表板上查看这些文档。

#### Acceptance Criteria

1. WHEN Sync_Service performs a sync operation, THE Sync_Service SHALL retrieve document IDs from environment configuration
2. IF no document IDs are configured in environment, THEN THE Sync_Service SHALL complete the sync operation without fetching documents and update the last sync timestamp
3. WHEN Sync_Service retrieves a document ID from configuration, THE Sync_Service SHALL validate that the document ID matches the pattern for Feishu document identifiers
4. IF a document ID fails validation, THEN THE Sync_Service SHALL log an error indicating the invalid document ID and continue processing remaining document IDs
5. WHEN Sync_Service processes a validated document ID, THE Sync_Service SHALL request document metadata from Feishu_API using the Access_Token within 30 seconds
6. IF Feishu_API does not respond to a metadata request within 30 seconds, THEN THE Sync_Service SHALL treat the request as failed, log a timeout error for that document, and continue processing remaining documents
7. IF Sync_Service cannot obtain a valid Access_Token before requesting document metadata, THEN THE Sync_Service SHALL terminate the sync operation and log an error indicating authentication failure
8. WHEN Feishu_API returns document metadata, THE Sync_Service SHALL extract the document title
9. IF the document metadata does not contain a title field, THEN THE Sync_Service SHALL use "Untitled" as the document title
10. WHEN Sync_Service fetches document content, THE Sync_Service SHALL request raw content from Feishu_API within 30 seconds
11. IF Feishu_API does not respond to a content request within 30 seconds, THEN THE Sync_Service SHALL treat the request as failed, log a timeout error for that document, and continue processing remaining documents
12. WHEN Feishu_API returns document content, THE Sync_Service SHALL store the document ID, title, content, type, and timestamp in Data_Store
13. IF Feishu_API returns an error response for a specific document request, THEN THE Sync_Service SHALL log an error message indicating the document ID and error details, and continue processing remaining documents
14. WHEN all configured document IDs have been processed, THE Sync_Service SHALL update the last sync timestamp in Data_Store

### Requirement 3: 电子表格数据同步

**User Story:** 作为用户，我希望系统能够从飞书获取电子表格数据，以便我可以在仪表板上查看这些表格内容。

#### Acceptance Criteria

1. WHEN Sync_Service performs a sync operation, THE Sync_Service SHALL retrieve spreadsheet IDs from the FEISHU_SHEET_IDS environment variable parsed as a comma-separated list
2. IF no spreadsheet IDs are configured in environment, THEN THE Sync_Service SHALL complete the sync operation without fetching spreadsheets and update the last sync timestamp
3. WHEN Sync_Service processes a spreadsheet ID, THE Sync_Service SHALL request spreadsheet metadata from https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheetId} using the Access_Token within 30 seconds
4. IF Feishu_API does not respond to a metadata request within 30 seconds, THEN THE Sync_Service SHALL log a timeout error for that spreadsheet and continue processing remaining spreadsheets
5. IF Sync_Service cannot obtain a valid Access_Token before requesting spreadsheet metadata, THEN THE Sync_Service SHALL terminate the sync operation and log an error indicating authentication failure
6. WHEN Feishu_API returns a response with code 0, THE Sync_Service SHALL extract the spreadsheet title from data.spreadsheet.title and the sheet list from data.spreadsheet.sheets
7. IF Feishu_API returns a response with code not equal to 0, THEN THE Sync_Service SHALL log the error message from the msg field and continue processing remaining spreadsheets
8. FOR EACH sheet in the spreadsheet, WHEN Sync_Service fetches sheet data, THE Sync_Service SHALL request cell values from https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{spreadsheetId}/values/{sheetId} within 30 seconds
9. IF Feishu_API does not respond to a sheet data request within 30 seconds, THEN THE Sync_Service SHALL log a timeout error for that sheet and store an empty array for that sheet's data
10. WHEN Feishu_API returns sheet data with code 0, THE Sync_Service SHALL store the sheet ID, sheet title, and values from data.valueRange.values
11. WHEN all sheets in a spreadsheet are processed, THE Sync_Service SHALL store the complete spreadsheet object with ID, title, sheets array, type set to "spreadsheet", and current ISO 8601 timestamp in Data_Store
12. IF Feishu_API returns an error response for a specific spreadsheet request, THEN THE Sync_Service SHALL log an error message indicating the spreadsheet ID and error details, and continue processing remaining spreadsheets

### Requirement 4: 自动同步机制

**User Story:** 作为用户，我希望系统能够自动定期同步飞书数据，以便我始终能看到最新的内容而无需手动操作。

#### Acceptance Criteria

1. WHEN THE Backend starts, THE Backend SHALL read the sync interval from the SYNC_INTERVAL environment variable with a default value of 5 minutes
2. WHEN THE Backend reads the sync interval, THE Backend SHALL validate that the interval is between 1 minute and 1440 minutes (24 hours) inclusive
3. IF the configured sync interval is outside the valid range, THEN THE Backend SHALL log a warning and use the default value of 5 minutes
4. WHEN THE Backend initializes Sync_Service, THE Sync_Service SHALL start a cron job that triggers every N minutes based on the validated sync interval
5. WHEN the cron job triggers, THE Sync_Service SHALL execute the sync operation to fetch documents and spreadsheets
6. WHILE THE Backend is running, THE Sync_Service SHALL continue executing sync operations at the configured interval
7. WHEN a sync operation completes with at least one successfully fetched document or spreadsheet, THE Sync_Service SHALL log "Sync completed successfully" and update the last sync timestamp in Data_Store
8. IF a sync operation completes with zero successfully fetched documents and zero successfully fetched spreadsheets, THEN THE Sync_Service SHALL log "Sync completed with no data fetched" and update the last sync timestamp in Data_Store
9. IF a sync operation throws an exception, THEN THE Sync_Service SHALL log the error message and continue with the next scheduled sync without updating the last sync timestamp
10. IF a sync operation results in partial success (some documents/spreadsheets fetched, others failed), THEN THE Sync_Service SHALL update Data_Store with successfully fetched data, log the number of successes and failures, and update the last sync timestamp

### Requirement 5: 手动同步触发

**User Story:** 作为用户，我希望能够手动触发数据同步，以便在我需要时立即获取最新数据。

#### Acceptance Criteria

1. WHILE no sync operation is in progress, THE Frontend SHALL display the sync button in an enabled state
2. WHILE a sync operation is in progress, THE Frontend SHALL display the sync button in a disabled state
3. WHEN a user clicks the enabled sync button, THE Frontend SHALL send a POST request to /api/sync endpoint
4. WHEN THE Backend receives a POST request at /api/sync, THE Backend SHALL check if a sync operation is already in progress
5. IF a sync operation is already in progress, THEN THE Backend SHALL return a 429 status code with an error message "Sync already in progress"
6. IF no sync operation is in progress, THEN THE Backend SHALL execute the sync operation within 30 seconds
7. IF the sync operation does not complete within 30 seconds, THEN THE Backend SHALL return a 504 status code with an error message "Sync operation timed out"
8. WHILE the sync operation is in progress, THE Frontend SHALL display a loading spinner icon on the sync button
9. WHEN the sync operation completes with at least one successfully fetched item, THE Backend SHALL return a 200 status code with a JSON response containing success: true and lastSync timestamp
10. WHEN THE Frontend receives a 200 response, THE Frontend SHALL display the message "同步成功！" for 3 seconds and refresh the displayed data
11. IF the sync operation fails, THEN THE Backend SHALL return a 500 status code with a JSON response containing success: false and an error message
12. WHEN THE Frontend receives an error response (status code >= 400), THE Frontend SHALL display the error message to the user for 5 seconds

### Requirement 6: 数据展示接口

**User Story:** 作为前端应用，我需要访问已同步的文档和电子表格数据，以便在用户界面上展示这些内容。

#### Acceptance Criteria

1. WHEN THE Frontend requests all documents, THE Backend SHALL return an array of all document objects from Data_Store
2. WHEN THE Frontend requests all spreadsheets, THE Backend SHALL return an array of all spreadsheet objects from Data_Store
3. WHEN THE Frontend requests a specific document by ID, THE Backend SHALL return the matching document object from Data_Store
4. IF the requested document ID does not exist, THEN THE Backend SHALL return a 404 status code with an error message
5. WHEN THE Frontend requests a specific spreadsheet by ID, THE Backend SHALL return the matching spreadsheet object from Data_Store
6. IF the requested spreadsheet ID does not exist, THEN THE Backend SHALL return a 404 status code with an error message
7. WHEN THE Frontend requests system health status, THE Backend SHALL return the last sync timestamp, document count, and spreadsheet count

### Requirement 7: 响应式用户界面

**User Story:** 作为用户，我希望在不同设备上都能清晰地查看数据仪表板，以便无论使用桌面电脑、平板还是手机都能获得良好的体验。

#### Acceptance Criteria

1. WHEN THE Frontend renders on a desktop screen (width >= 1024px), THE Frontend SHALL display data cards in a grid with 3 columns
2. WHEN THE Frontend renders on a tablet screen (768px <= width < 1024px), THE Frontend SHALL display data cards in a grid with 2 columns
3. WHEN THE Frontend renders on a mobile screen (width < 768px), THE Frontend SHALL display data cards in a single-column layout
4. WHEN THE Frontend renders a document card, THE Frontend SHALL display the document title, a preview of the first 150 characters of content, and the last updated timestamp formatted as ISO 8601
5. IF a document has no content, THEN THE Frontend SHALL display "暂无内容" in place of the content preview
6. WHEN THE Frontend renders a spreadsheet card, THE Frontend SHALL display the spreadsheet title and the names of the first 3 sheets
7. WHEN THE Frontend renders sheet data in a table, THE Frontend SHALL display a maximum of 5 rows and 5 columns per sheet preview
8. IF a sheet has more than 5 rows or 5 columns, THEN THE Frontend SHALL display "... 还有 X 行" or "... 还有 X 列" to indicate truncated data
9. WHEN THE Frontend renders on any screen size, THE Frontend SHALL set the minimum font size to 14px to ensure text readability
10. WHEN THE Frontend renders on any screen size, THE Frontend SHALL ensure that all text content wraps within the card boundaries without requiring horizontal scrolling

### Requirement 8: 数据过滤和分类

**User Story:** 作为用户，我希望能够按照类型筛选显示的数据，以便快速找到我需要的文档或电子表格。

#### Acceptance Criteria

1. WHEN THE Frontend displays the dashboard, THE Frontend SHALL show three filter tabs: "全部", "文档", and "表格"
2. WHEN a user clicks the "全部" tab, THE Frontend SHALL display both documents and spreadsheets
3. WHEN a user clicks the "文档" tab, THE Frontend SHALL display only document cards
4. WHEN a user clicks the "表格" tab, THE Frontend SHALL display only spreadsheet cards
5. WHEN THE Frontend displays a filter tab, THE Frontend SHALL show the count of items in that category
6. WHEN a user switches tabs, THE Frontend SHALL highlight the active tab with a visual indicator

### Requirement 9: 加载状态和错误处理

**User Story:** 作为用户，我希望在数据加载过程中看到明确的状态提示，以及在发生错误时看到清晰的错误信息，以便了解系统的运行状态。

#### Acceptance Criteria

1. WHEN THE Frontend is initially loading data, THE Frontend SHALL display a loading spinner with a "加载中..." message
2. WHILE a sync operation is in progress, THE Frontend SHALL display a loading indicator on the sync button
3. WHEN a data request fails, THE Frontend SHALL display an error banner at the top of the page with the error message
4. WHEN THE Frontend displays an error banner, THE Frontend SHALL include a close button to dismiss the error
5. WHEN Data_Store is empty, THE Frontend SHALL display an empty state message with configuration instructions
6. WHEN THE Backend encounters an API error, THE Backend SHALL log the error details to the console
7. WHEN an exception occurs during sync, THE Backend SHALL catch the exception and return an appropriate error response

### Requirement 10: 自动数据刷新

**User Story:** 作为用户，我希望前端界面能够自动刷新显示的数据，以便在不手动刷新页面的情况下看到更新的内容。

#### Acceptance Criteria

1. WHEN THE Frontend completes initial data loading, THE Frontend SHALL start a refresh timer with a 30-second interval
2. WHEN the refresh timer triggers, THE Frontend SHALL silently fetch updated data from the Backend without showing the loading spinner
3. WHEN silent refresh completes successfully, THE Frontend SHALL update the displayed documents and spreadsheets
4. WHEN THE Frontend unmounts, THE Frontend SHALL clear the refresh timer to prevent memory leaks
5. WHEN a manual sync completes, THE Frontend SHALL trigger an immediate data refresh

### Requirement 11: 环境配置管理

**User Story:** 作为系统管理员，我希望通过环境变量配置应用参数，以便在不修改代码的情况下调整系统行为。

#### Acceptance Criteria

1. THE Backend SHALL read FEISHU_APP_ID from environment variables for API authentication
2. THE Backend SHALL read FEISHU_APP_SECRET from environment variables for API authentication
3. THE Backend SHALL read FEISHU_DOCUMENT_IDS from environment variables as a comma-separated list
4. THE Backend SHALL read FEISHU_SHEET_IDS from environment variables as a comma-separated list
5. THE Backend SHALL read SYNC_INTERVAL from environment variables with a default value of 5 minutes
6. THE Backend SHALL read PORT from environment variables with a default value of 3001
7. WHEN THE Backend parses comma-separated IDs, THE Backend SHALL trim whitespace from each ID
8. IF required environment variables are missing, THEN THE Backend SHALL log a warning and continue with empty data sets

### Requirement 12: 跨域资源共享（CORS）

**User Story:** 作为前端应用，我需要从不同的端口访问后端 API，以便在开发环境中正常工作。

#### Acceptance Criteria

1. WHEN THE Backend initializes Express middleware, THE Backend SHALL enable CORS for all routes
2. WHEN THE Frontend sends a request to the Backend from a different origin, THE Backend SHALL include appropriate CORS headers in the response
3. WHEN THE Backend handles a preflight OPTIONS request, THE Backend SHALL return a successful response with CORS headers

