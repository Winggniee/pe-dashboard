import './Card.css';

function DocumentCard({ document }) {
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

  const truncateContent = (content, maxLength = 200) => {
    if (!content) return '暂无内容';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="card document-card">
      <div className="card-header">
        <div className="card-icon">📄</div>
        <div className="card-title-section">
          <h3 className="card-title">{document.title}</h3>
          <span className="card-type">文档</span>
        </div>
      </div>
      
      <div className="card-content">
        <p className="content-preview">
          {truncateContent(document.content)}
        </p>
      </div>
      
      <div className="card-footer">
        <span className="update-time">
          🕒 {formatDate(document.lastUpdated)}
        </span>
        <span className="doc-id">
          ID: {document.id.substring(0, 8)}...
        </span>
      </div>
    </div>
  );
}

export default DocumentCard;
