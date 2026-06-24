import { useState, useEffect } from 'react';
import './App.css';
import api from './services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';

// Dynamic color assignment
const STATUS_COLORS = {};
const COLOR_PALETTE = [
  '#48bb78', '#4299e1', '#f6ad55', '#9f7aea', '#ed8936',
  '#38b2ac', '#fc8181', '#e53e3e', '#cbd5e0', '#667eea',
  '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140'
];

// Define status order
const STATUS_ORDER = [
  '维护中',
  '调优中',
  '搭建中',
  '测试中',
  '等待中（等商务）',
  '等待中（等客户）',
  '未知状态',
  '封号',
  '已流失'
];

function App() {
  const [peStats, setPeStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [allStatuses, setAllStatuses] = useState([]);
  const [displayStatuses, setDisplayStatuses] = useState([]); // Statuses in display order
  const [totalPEs, setTotalPEs] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalWorkload, setTotalWorkload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sortBy, setSortBy] = useState('total'); // 'total' or specific status name

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    
    // Handle scroll for back-to-top button
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    
    try {
      const data = await api.getPEStats();
      const stats = data.peStats || [];
      
      setPeStats(stats);
      setTotalPEs(data.totalPEs || 0);
      setTotalProjects(data.totalProjects || 0);
      setTotalWorkload(data.totalWorkload || 0);
      setLastSync(data.lastSync);
      
      // Get all unique statuses across all PEs
      const statusSet = new Set();
      stats.forEach(pe => {
        Object.keys(pe.statusBreakdown || {}).forEach(status => {
          statusSet.add(status);
        });
      });
      
      // Sort statuses according to STATUS_ORDER
      const uniqueStatuses = Array.from(statusSet).sort((a, b) => {
        const indexA = STATUS_ORDER.indexOf(a);
        const indexB = STATUS_ORDER.indexOf(b);
        // If status is in ORDER, use that index; otherwise put at end
        const orderA = indexA === -1 ? 999 : indexA;
        const orderB = indexB === -1 ? 999 : indexB;
        return orderA - orderB;
      });
      
      setAllStatuses(uniqueStatuses);
      setDisplayStatuses(uniqueStatuses);
      
      // Assign colors to statuses
      uniqueStatuses.forEach((status, index) => {
        if (!STATUS_COLORS[status]) {
          STATUS_COLORS[status] = COLOR_PALETTE[index % COLOR_PALETTE.length];
        }
      });
      
      // Prepare data for stacked bar chart (sorted by sortBy)
      const sortedStats = [...stats].sort((a, b) => {
        if (sortBy === 'total') {
          return b.projectCount - a.projectCount;
        } else {
          const countA = a.statusBreakdown[sortBy] || 0;
          const countB = b.statusBreakdown[sortBy] || 0;
          return countB - countA;
        }
      });
      
      const chartDataArray = sortedStats.map(pe => {
        const dataPoint = {
          name: pe.name,
          total: pe.projectCount
        };
        
        // Always use consistent order
        uniqueStatuses.forEach(status => {
          dataPoint[status] = pe.statusBreakdown[status] || 0;
        });
        
        return dataPoint;
      });
      
      setChartData(chartDataArray);
    } catch (err) {
      setError(err.message || '加载数据失败');
      console.error('Error loading PE stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    
    try {
      await api.triggerSync();
      await loadData(true);
      alert('同步成功！');
    } catch (err) {
      setError(err.message || '同步失败');
      alert('同步失败：' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '未同步';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy);
  };

  // Re-sort data when sortBy changes
  useEffect(() => {
    if (peStats.length > 0 && allStatuses.length > 0) {
      const sortedStats = [...peStats].sort((a, b) => {
        if (sortBy === 'total') {
          return b.projectCount - a.projectCount;
        } else {
          const countA = a.statusBreakdown[sortBy] || 0;
          const countB = b.statusBreakdown[sortBy] || 0;
          return countB - countA;
        }
      });
      
      // Always use the same order - allStatuses (which follows STATUS_ORDER)
      const chartDataArray = sortedStats.map(pe => {
        const dataPoint = {
          name: pe.name,
          total: pe.projectCount
        };
        
        allStatuses.forEach(status => {
          dataPoint[status] = pe.statusBreakdown[status] || 0;
        });
        
        return dataPoint;
      });
      
      setChartData(chartDataArray);
      setDisplayStatuses(allStatuses);
    }
  }, [sortBy, peStats, allStatuses]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length > 0) {
      // Find the PE data
      const peData = peStats.find(pe => pe.name === label);
      if (!peData) return null;
      
      // If a specific status is selected, show only projects in that status
      if (sortBy !== 'total') {
        const projectsInSelectedStatus = peData.projects.filter(
          p => p.status === sortBy
        ) || [];
        
        const count = peData.statusBreakdown[sortBy] || 0;
        
        return (
          <div className="custom-tooltip">
            <p className="tooltip-label">{label}</p>
            <p style={{ 
              color: STATUS_COLORS[sortBy], 
              fontWeight: 700,
              fontSize: '1.1rem',
              marginBottom: '0.5rem'
            }}>
              {sortBy}: {count} 个项目
            </p>
            {projectsInSelectedStatus.length > 0 && (
              <div className="tooltip-projects">
                <div className="tooltip-projects-title">项目列表:</div>
                {projectsInSelectedStatus.slice(0, 8).map((project, idx) => (
                  <div key={idx} className="tooltip-project-item">
                    {project.name}
                  </div>
                ))}
                {projectsInSelectedStatus.length > 8 && (
                  <div className="tooltip-project-item" style={{ fontStyle: 'italic', color: '#8b8c89' }}>
                    ... 还有 {projectsInSelectedStatus.length - 8} 个项目
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      
      // If "总项目数" is selected, show all projects with their statuses
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          <p className="tooltip-total" style={{ 
            fontWeight: 800,
            color: '#274c77',
            fontSize: '1.1rem',
            marginBottom: '0.5rem'
          }}>
            总项目数: {peData.projectCount} 个
          </p>
          <div className="tooltip-projects">
            <div className="tooltip-projects-title">按状态分布:</div>
            {Object.entries(peData.statusBreakdown || {})
              .filter(([_, count]) => count > 0)
              .sort((a, b) => {
                const indexA = STATUS_ORDER.indexOf(a[0]);
                const indexB = STATUS_ORDER.indexOf(b[0]);
                const orderA = indexA === -1 ? 999 : indexA;
                const orderB = indexB === -1 ? 999 : indexB;
                return orderA - orderB;
              })
              .map(([status, count]) => (
                <div key={status} className="tooltip-project-item" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.3rem' 
                  }}>
                    <span style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      backgroundColor: STATUS_COLORS[status],
                      display: 'inline-block'
                    }}></span>
                    {status}
                  </span>
                  <span style={{ fontWeight: 700, color: STATUS_COLORS[status] }}>{count}</span>
                </div>
              ))}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>PE 项目统计看板</h1>
          <div className="header-actions">
            <button 
              className={`sync-button ${syncing ? 'syncing' : ''}`}
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? '同步中...' : '🔄 手动同步'}
            </button>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <div className="stat-label">PE 总数</div>
            <div className="stat-value">{totalPEs}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">项目总数</div>
            <div className="stat-value">{totalProjects}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">总工作负载</div>
            <div className="stat-value">{totalWorkload}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">平均每人项目数</div>
            <div className="stat-value">
              {totalPEs > 0 ? (totalProjects / totalPEs).toFixed(1) : 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">平均每人负载</div>
            <div className="stat-value">
              {totalPEs > 0 ? (totalWorkload / totalPEs).toFixed(1) : 0}
            </div>
          </div>
          <div className="stat-info">
            <span className="last-sync">最后同步: {formatDate(lastSync)}</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="content">
        {peStats.length === 0 ? (
          <div className="empty-state">
            <h2>暂无数据</h2>
            <p>请检查飞书多维表格配置</p>
          </div>
        ) : (
          <>
            {/* Main Bar Chart */}
            <div className="chart-section">
              {/* Sort Controls */}
              <div className="sort-controls">
                <span className="sort-label">排序方式:</span>
                <div className="sort-buttons">
                  <button 
                    className={`sort-btn ${sortBy === 'total' ? 'active' : ''}`}
                    onClick={() => handleSortChange('total')}
                  >
                    总项目数
                  </button>
                  {allStatuses.map(status => (
                    <button 
                      key={status}
                      className={`sort-btn ${sortBy === status ? 'active' : ''}`}
                      onClick={() => handleSortChange(status)}
                      style={{
                        '--status-color': STATUS_COLORS[status]
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chart-legend-container">
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={Math.max(400, peStats.length * 60)}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 20, right: 30, left: 120, bottom: 20 }}
                      onClick={(data) => {
                        if (data && data.activeLabel) {
                          // Scroll to the PE name header in detail section
                          const peHeaderId = `pe-header-${data.activeLabel}`;
                          const element = document.getElementById(peHeaderId);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Add highlight effect
                            const card = element.closest('.pe-detail-card');
                            if (card) {
                              card.style.transform = 'scale(1.02)';
                              card.style.boxShadow = '0 0 30px rgba(96, 150, 186, 0.6)';
                              setTimeout(() => {
                                card.style.transform = '';
                                card.style.boxShadow = '';
                              }, 2000);
                            }
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(39, 76, 119, 0.1)" />
                      <XAxis type="number" stroke="#274c77" />
                      <YAxis dataKey="name" type="category" width={100} stroke="#274c77" />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(163, 206, 241, 0.1)' }} />
                      
                      {displayStatuses.map((status, index) => {
                        return (
                          <Bar 
                            key={`${status}-${index}`}
                            dataKey={status}
                            stackId="a"
                            fill={STATUS_COLORS[status]}
                            shape={(props) => {
                              const { x, y, width, height, fill } = props;
                              if (width <= 0) return null;
                              
                              const dataPoint = chartData[props.index];
                              if (!dataPoint) return null;
                              
                              // Find which is actually the last visible segment
                              let lastVisibleIndex = -1;
                              for (let i = displayStatuses.length - 1; i >= 0; i--) {
                                if ((dataPoint[displayStatuses[i]] || 0) > 0) {
                                  lastVisibleIndex = i;
                                  break;
                                }
                              }
                              
                              const isRightmost = (index === lastVisibleIndex);
                              
                              if (isRightmost) {
                                const radius = 10;
                                const path = `
                                  M ${x},${y}
                                  L ${x + width - radius},${y}
                                  Q ${x + width},${y} ${x + width},${y + radius}
                                  L ${x + width},${y + height - radius}
                                  Q ${x + width},${y + height} ${x + width - radius},${y + height}
                                  L ${x},${y + height}
                                  Z
                                `;
                                return <path d={path} fill={fill} />;
                              }
                              
                              return <rect x={x} y={y} width={width} height={height} fill={fill} />;
                            }}
                          >
                            <LabelList 
                              content={({ x, y, width, height, value, index: dataIndex }) => {
                                const dataPoint = chartData[dataIndex];
                                if (!dataPoint || !value || value === 0) return null;
                                
                                // Find which is actually the last visible segment
                                let lastVisibleIndex = -1;
                                for (let i = displayStatuses.length - 1; i >= 0; i--) {
                                  if ((dataPoint[displayStatuses[i]] || 0) > 0) {
                                    lastVisibleIndex = i;
                                    break;
                                  }
                                }
                                
                                // Only show label on the actual last segment
                                if (index !== lastVisibleIndex) return null;
                                
                                const totalValue = dataPoint.total;
                                
                                // Calculate fire emoji placement
                                let isTopPE = false;
                                if (sortBy === 'total') {
                                  const maxCount = Math.max(...chartData.map(d => d.total));
                                  isTopPE = totalValue === maxCount;
                                } else {
                                  const statusCounts = chartData.map(d => d[sortBy] || 0);
                                  const maxCount = Math.max(...statusCounts);
                                  const currentCount = dataPoint[sortBy] || 0;
                                  isTopPE = currentCount === maxCount && maxCount > 0 && 
                                            statusCounts.indexOf(maxCount) === dataIndex;
                                }
                                
                                return (
                                  <g>
                                    <text 
                                      x={x + width + (isTopPE ? 28 : 8)} 
                                      y={y + height / 2} 
                                      fill="#274c77" 
                                      textAnchor="start" 
                                      dominantBaseline="middle"
                                      style={{ fontWeight: 'bold', fontSize: '14px' }}
                                    >
                                      {totalValue}
                                    </text>
                                    {isTopPE && (
                                      <text 
                                        x={x + width + 6} 
                                        y={y + height / 2 - 2} 
                                        fill="#6096ba" 
                                        textAnchor="start" 
                                        dominantBaseline="middle"
                                        style={{ fontSize: '18px' }}
                                      >
                                        🔥
                                      </text>
                                    )}
                                  </g>
                                );
                              }}
                              position="right"
                            />
                          </Bar>
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend on the right */}
                <div className="legend-section">
                  <h3>客户状态图例</h3>
                  <div className="legend-items">
                    {allStatuses.map(status => (
                      <div key={status} className="legend-item">
                        <span 
                          className="legend-color" 
                          style={{ backgroundColor: STATUS_COLORS[status] }}
                        ></span>
                        <span className="legend-label">{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed PE Cards */}
            <div className="pe-details-section">
              <h2 style={{ color: '#274c77' }}>详细项目列表</h2>
              <div className="pe-cards-grid">
                {chartData.map((peData, index) => {
                  // Find the full PE data from peStats
                  const pe = peStats.find(p => p.name === peData.name);
                  if (!pe) return null;
                  
                  return (
                    <div 
                      key={pe.id || index} 
                      id={`pe-detail-${pe.name}`}
                      className="pe-detail-card"
                      style={{ transition: 'all 0.5s ease' }}
                    >
                      <div className="pe-card-header" id={`pe-header-${pe.name}`}>
                        <div className="pe-rank">#{index + 1}</div>
                        <div>
                          <h3>{pe.name}</h3>
                          <p className="project-count-text">
                            {pe.projectCount} 个项目 | 负载: {pe.workload}
                          </p>
                        </div>
                      </div>
                    
                    <div className="status-breakdown">
                      {Object.entries(pe.statusBreakdown || {})
                        .sort((a, b) => {
                          // Sort by STATUS_ORDER
                          const indexA = STATUS_ORDER.indexOf(a[0]);
                          const indexB = STATUS_ORDER.indexOf(b[0]);
                          const orderA = indexA === -1 ? 999 : indexA;
                          const orderB = indexB === -1 ? 999 : indexB;
                          return orderA - orderB;
                        })
                        .map(([status, count]) => (
                          <div key={status} className="status-row">
                            <span 
                              className="status-dot" 
                              style={{ backgroundColor: STATUS_COLORS[status] }}
                            ></span>
                            <span className="status-text">{status}</span>
                            <span className="status-count">{count}</span>
                          </div>
                        ))}
                    </div>
                    
                    <div className="projects-list">
                      <h4>项目列表</h4>
                      {pe.projects
                        .sort((a, b) => {
                          // Sort by STATUS_ORDER
                          const indexA = STATUS_ORDER.indexOf(a.status);
                          const indexB = STATUS_ORDER.indexOf(b.status);
                          const orderA = indexA === -1 ? 999 : indexA;
                          const orderB = indexB === -1 ? 999 : indexB;
                          return orderA - orderB;
                        })
                        .map((project, idx) => (
                          <div key={idx} className="project-row">
                            <span className="project-num">{idx + 1}.</span>
                            <span className="project-title">{project.name}</span>
                            <span 
                              className="project-difficulty"
                              style={{ 
                                fontSize: '0.75rem',
                                color: project.difficulty === '高难项目' ? '#a22c29' : '#8b8c89',
                                fontWeight: project.difficulty === '高难项目' ? 700 : 600
                              }}
                            >
                              {project.difficulty}
                            </span>
                            <span 
                              className="project-badge"
                              style={{ 
                                backgroundColor: STATUS_COLORS[project.status] + '20',
                                color: STATUS_COLORS[project.status],
                                borderColor: STATUS_COLORS[project.status]
                              }}
                            >
                              {project.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Back to Top Button */}
      {showScrollTop && (
        <button 
          className="back-to-top"
          onClick={scrollToTop}
          aria-label="返回顶部"
        >
          ↑
        </button>
      )}
    </div>
  );
}

export default App;
