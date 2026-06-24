import './Card.css';

function WikiCard({ wiki }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const getContentPreview = (content) => {
    if (!content) return '暂无内容';
    return content.length > 150 ? content.substring(0, 150) + '...' : content;
  };

  return (
    <div className="card wiki-card">
      <div className="card-header">
        <h3>📖 {wiki.title}</h3>
        <span className="card-type">Wiki</span>
      </div>
      <div className="card-content">
        <p className="content-preview">{getContentPreview(wiki.content)}</p>
        {wiki.objType && (
          <p className="wiki-type">类型: {wiki.objType}</p>
        )}
      </div>
      <div className="card-footer">
        <span className="last-updated">
          更新时间: {formatDate(wiki.lastUpdated)}
        </span>
      </div>
    </div>
  );
}

export default WikiCard;
