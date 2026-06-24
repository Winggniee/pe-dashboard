import './Card.css';

function BitableCard({ bitable }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="card bitable-card">
      <div className="card-header">
        <h3>🗂️ {bitable.title}</h3>
        <span className="card-type">多维表格</span>
      </div>
      <div className="card-content">
        <div className="bitable-info">
          <p className="table-count">
            包含 {bitable.tables?.length || 0} 个表格
          </p>
          {bitable.tables && bitable.tables.length > 0 && (
            <div className="tables-list">
              {bitable.tables.slice(0, 3).map((table, idx) => (
                <div key={idx} className="table-item">
                  <strong>{table.tableName}</strong>
                  <span className="record-count">
                    {table.records?.length || 0} 条记录
                  </span>
                </div>
              ))}
              {bitable.tables.length > 3 && (
                <p className="more-info">
                  ... 还有 {bitable.tables.length - 3} 个表格
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="card-footer">
        <span className="last-updated">
          更新时间: {formatDate(bitable.lastUpdated)}
        </span>
      </div>
    </div>
  );
}

export default BitableCard;
