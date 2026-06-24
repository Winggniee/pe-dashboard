import './Header.css';

function Header({ lastSync, onSync, syncing, totalItems }) {
  const formatDate = (dateString) => {
    if (!dateString) return '从未同步';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1>📊 飞书数据仪表板</h1>
          <p className="subtitle">实时同步飞书文档和表格</p>
        </div>
        
        <div className="header-right">
          <div className="sync-info">
            <span className="sync-label">最后同步时间</span>
            <span className="sync-time">{formatDate(lastSync)}</span>
          </div>
          
          <button 
            className={`sync-button ${syncing ? 'syncing' : ''}`}
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <span className="sync-spinner">⟳</span>
                同步中...
              </>
            ) : (
              <>
                🔄 立即同步
              </>
            )}
          </button>

          <div className="item-count">
            <span className="count">{totalItems}</span>
            <span className="count-label">个项目</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
