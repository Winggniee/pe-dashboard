import './Card.css';

function SheetCard({ sheet }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTotalRows = () => {
    return sheet.sheets.reduce((total, s) => {
      return total + (s.data?.length || 0);
    }, 0);
  };

  const renderSheetPreview = (sheetData) => {
    if (!sheetData.data || sheetData.data.length === 0) {
      return <p className="no-data">暂无数据</p>;
    }

    const headers = sheetData.data[0] || [];
    const rows = sheetData.data.slice(1, 4); // Show first 3 rows

    return (
      <div className="sheet-preview">
        <h4 className="sheet-name">{sheetData.title}</h4>
        <div className="table-wrapper">
          <table className="preview-table">
            <thead>
              <tr>
                {headers.map((header, i) => (
                  <th key={i}>{header || `列${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sheetData.data.length > 4 && (
          <p className="more-rows">
            ... 还有 {sheetData.data.length - 4} 行
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="card sheet-card">
      <div className="card-header">
        <div className="card-icon">📊</div>
        <div className="card-title-section">
          <h3 className="card-title">{sheet.title}</h3>
          <span className="card-type">电子表格</span>
        </div>
      </div>
      
      <div className="card-content">
        <div className="sheet-stats">
          <span className="stat">
            📑 {sheet.sheets.length} 个工作表
          </span>
          <span className="stat">
            📝 {getTotalRows()} 行数据
          </span>
        </div>
        
        {sheet.sheets.slice(0, 2).map((s, index) => (
          <div key={index}>
            {renderSheetPreview(s)}
          </div>
        ))}
        
        {sheet.sheets.length > 2 && (
          <p className="more-sheets">
            ... 还有 {sheet.sheets.length - 2} 个工作表
          </p>
        )}
      </div>
      
      <div className="card-footer">
        <span className="update-time">
          🕒 {formatDate(sheet.lastUpdated)}
        </span>
        <span className="doc-id">
          ID: {sheet.id.substring(0, 8)}...
        </span>
      </div>
    </div>
  );
}

export default SheetCard;
