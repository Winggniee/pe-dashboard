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
  '未知状态'
];

// Define PE availability categories based on their project statuses
const getAvailabilityCategory = (pe) => {
  const breakdown = pe.statusBreakdown || {};
  
  // Count high-intensity work projects
  const optimizeCount = breakdown['调优中'] || 0;
  const buildCount = breakdown['搭建中'] || 0;
  const testCount = breakdown['测试中'] || 0;
  const maintainCount = breakdown['维护中'] || 0;
  
  // 🔴 深度工作 (Red) - Criteria:
  // - >2 projects in 调优中 OR
  // - >2 projects in 搭建中 OR
  // - >10 projects in 维护中 OR
  // - Any combination of 测试中 with 调优中/搭建中 that totals >2
  const highIntensityCount = optimizeCount + buildCount + testCount;
  
  if (optimizeCount > 2 || buildCount > 2 || maintainCount > 10 || highIntensityCount > 2) {
    return 'busy';
  }
  
  // 🟡 半阻塞 (Yellow) - Has projects in 等待中（等客户）
  if ((breakdown['等待中（等客户）'] || 0) > 0) {
    return 'semi-blocked';
  }
  
  // 🟢 空闲 (Green) - Everything else
  return 'available';
};

function App() {
  const [peStats, setPeStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [allStatuses, setAllStatuses] = useState([]);
  const [displayStatuses, setDisplayStatuses] = useState([]); // Statuses in display order
  const [totalPEs, setTotalPEs] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalWorkload, setTotalWorkload] = useState(0);
  const [capacityDistribution, setCapacityDistribution] = useState({
    busy: 0,
    semiBlocked: 0,
    available: 0,
    busyPEs: [],
    semiBlockedPEs: [],
    availablePEs: []
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sortBy, setSortBy] = useState('total'); // 'total' or specific status name
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCapacity, setSelectedCapacity] = useState(null); // 'busy', 'semi-blocked', 'available', or null
  
  // Workload calculation weights (user adjustable)
  const [weights, setWeights] = useState({
    // Difficulty weights
    difficultWeight: 3,
    mediumWeight: 2,
    easyWeight: 1,
    // Status multipliers
    maintainMultiplier: 1.0,
    optimizeMultiplier: 1.5,
    buildMultiplier: 1.5,
    testMultiplier: 1.0,
    waitBusinessMultiplier: 0.3,
    waitClientMultiplier: 0.3,
    unknownMultiplier: 0.5
  });

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
      const data = await api.getPEStats(weights);
      const stats = data.peStats || [];
      
      setPeStats(stats);
      setTotalPEs(data.totalPEs || 0);
      setTotalProjects(data.totalProjects || 0);
      setTotalWorkload(data.totalWorkload || 0);
      setLastSync(data.lastSync);
      
      // Calculate capacity distribution
      const capacityStats = {
        busy: 0,
        semiBlocked: 0,
        available: 0,
        busyPEs: [],
        semiBlockedPEs: [],
        availablePEs: []
      };
      
      stats.forEach(pe => {
        const category = getAvailabilityCategory(pe);
        if (category === 'busy') {
          capacityStats.busy++;
          capacityStats.busyPEs.push(pe.name);
        } else if (category === 'semi-blocked') {
          capacityStats.semiBlocked++;
          capacityStats.semiBlockedPEs.push(pe.name);
        } else {
          capacityStats.available++;
          capacityStats.availablePEs.push(pe.name);
        }
      });
      
      setCapacityDistribution(capacityStats);
      
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
        } else if (sortBy === 'workload') {
          return b.workload - a.workload;
        } else {
          const countA = a.statusBreakdown[sortBy] || 0;
          const countB = b.statusBreakdown[sortBy] || 0;
          return countB - countA;
        }
      });
      
      const chartDataArray = sortedStats.map(pe => {
        const dataPoint = {
          name: pe.name,
          total: pe.projectCount,
          workload: pe.workload  // Add workload for display
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
        } else if (sortBy === 'workload') {
          return b.workload - a.workload;
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
          total: pe.projectCount,
          workload: pe.workload  // Add workload for display
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
      
      // Filter only 高难项目
      const highDifficultyProjects = peData.projects.filter(
        p => p.difficulty === '高难项目'
      ) || [];
      
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          <p style={{ 
            fontWeight: 700,
            color: '#274c77',
            fontSize: '1.1rem',
            marginBottom: '0.5rem'
          }}>
            工作负载: {peData.workload.toFixed(1)}
          </p>
          {highDifficultyProjects.length > 0 && (
            <div className="tooltip-projects">
              <div className="tooltip-projects-title" style={{ color: '#a22c29' }}>
                🔥 高难项目 ({highDifficultyProjects.length}个):
              </div>
              {highDifficultyProjects.slice(0, 8).map((project, idx) => (
                <div key={idx} className="tooltip-project-item" style={{ color: '#a22c29' }}>
                  {project.name}
                  <span style={{ 
                    marginLeft: '0.5rem',
                    fontSize: '0.75rem',
                    color: STATUS_COLORS[project.status] || '#8b8c89'
                  }}>
                    ({project.status})
                  </span>
                </div>
              ))}
              {highDifficultyProjects.length > 8 && (
                <div className="tooltip-project-item" style={{ fontStyle: 'italic', color: '#a22c29' }}>
                  ... 还有 {highDifficultyProjects.length - 8} 个高难项目
                </div>
              )}
            </div>
          )}
          {highDifficultyProjects.length === 0 && (
            <div className="tooltip-projects">
              <div className="tooltip-projects-title" style={{ color: '#8b8c89' }}>
                该PE暂无高难项目
              </div>
            </div>
          )}
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
            <div className="stat-value">{totalWorkload.toFixed(1)}</div>
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
              {/* Capacity Distribution Cards */}
              <div className="capacity-distribution">
                <h3 className="capacity-title">📊 团队人力分布</h3>
                <div className="capacity-cards">
                  <div 
                    className={`capacity-card busy ${selectedCapacity === 'busy' ? 'active' : ''}`}
                    onClick={() => setSelectedCapacity(selectedCapacity === 'busy' ? null : 'busy')}
                  >
                    <div className="capacity-icon">🔴</div>
                    <div className="capacity-info">
                      <div className="capacity-label">深度工作</div>
                      <div className="capacity-count">{capacityDistribution.busy} 人</div>
                      <div className="capacity-definition">
                        &gt;2个调优/搭建 或 &gt;10个维护
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className={`capacity-card semi-blocked ${selectedCapacity === 'semi-blocked' ? 'active' : ''}`}
                    onClick={() => setSelectedCapacity(selectedCapacity === 'semi-blocked' ? null : 'semi-blocked')}
                  >
                    <div className="capacity-icon">🟡</div>
                    <div className="capacity-info">
                      <div className="capacity-label">半阻塞</div>
                      <div className="capacity-count">{capacityDistribution.semiBlocked} 人</div>
                      <div className="capacity-definition">
                        有等待客户反馈的项目
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className={`capacity-card available ${selectedCapacity === 'available' ? 'active' : ''}`}
                    onClick={() => setSelectedCapacity(selectedCapacity === 'available' ? null : 'available')}
                  >
                    <div className="capacity-icon">🟢</div>
                    <div className="capacity-info">
                      <div className="capacity-label">空闲/商务阻塞</div>
                      <div className="capacity-count">{capacityDistribution.available} 人</div>
                      <div className="capacity-definition">
                        可接收新项目
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Show PE names when a capacity is selected */}
                {selectedCapacity && (
                  <div className="selected-pes">
                    <div className="selected-pes-header">
                      {selectedCapacity === 'busy' && '🔴 深度工作中的PE：'}
                      {selectedCapacity === 'semi-blocked' && '🟡 半阻塞的PE：'}
                      {selectedCapacity === 'available' && '🟢 可分配的PE：'}
                    </div>
                    <div className="selected-pes-list">
                      {selectedCapacity === 'busy' && capacityDistribution.busyPEs.map((name, idx) => (
                        <span key={idx} className="pe-tag busy-tag">{name}</span>
                      ))}
                      {selectedCapacity === 'semi-blocked' && capacityDistribution.semiBlockedPEs.map((name, idx) => (
                        <span key={idx} className="pe-tag semi-tag">{name}</span>
                      ))}
                      {selectedCapacity === 'available' && capacityDistribution.availablePEs.map((name, idx) => (
                        <span key={idx} className="pe-tag available-tag">{name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
                  <button 
                    className={`sort-btn ${sortBy === 'workload' ? 'active' : ''}`}
                    onClick={() => handleSortChange('workload')}
                  >
                    工作负载
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
                                
                                // Determine which value to display based on sort mode
                                let displayValue;
                                if (sortBy === 'workload') {
                                  displayValue = dataPoint.workload.toFixed(1);
                                } else {
                                  displayValue = dataPoint.total;
                                }
                                
                                // Calculate fire emoji placement for workload sorting
                                let isTopPE = false;
                                if (sortBy === 'total') {
                                  const maxCount = Math.max(...chartData.map(d => d.total));
                                  isTopPE = dataPoint.total === maxCount && dataIndex === 0;
                                } else if (sortBy === 'workload') {
                                  // Find PE with highest workload
                                  const maxWorkload = Math.max(...chartData.map(d => d.workload));
                                  isTopPE = dataPoint.workload === maxWorkload && dataIndex === 0;
                                } else {
                                  const statusCounts = chartData.map(d => d[sortBy] || 0);
                                  const maxCount = Math.max(...statusCounts);
                                  const currentCount = dataPoint[sortBy] || 0;
                                  isTopPE = currentCount === maxCount && maxCount > 0 && dataIndex === 0;
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
                                      {displayValue}
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
                            {pe.projectCount} 个项目 | 负载: {pe.workload.toFixed(1)}
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

      {/* Settings Button */}
      <button 
        className="settings-button"
        onClick={() => setShowSettings(!showSettings)}
        aria-label="负载权重设置"
      >
        ⚙️
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h3>⚙️ 工作负载权重设置</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div className="settings-content">
              <div className="settings-section">
                <h4>📊 项目难度权重</h4>
                <div className="setting-item">
                  <label>高难项目</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.difficultWeight}
                    onChange={(e) => setWeights({...weights, difficultWeight: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="setting-item">
                  <label>中等项目</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.mediumWeight}
                    onChange={(e) => setWeights({...weights, mediumWeight: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="setting-item">
                  <label>简单项目</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.easyWeight}
                    onChange={(e) => setWeights({...weights, easyWeight: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div className="settings-section">
                <h4>🔄 客户状态倍数</h4>
                <div className="setting-item">
                  <label>维护中</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.maintainMultiplier}
                    onChange={(e) => setWeights({...weights, maintainMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">中等负载</span>
                </div>
                <div className="setting-item">
                  <label>调优中</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.optimizeMultiplier}
                    onChange={(e) => setWeights({...weights, optimizeMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">高负载</span>
                </div>
                <div className="setting-item">
                  <label>搭建中</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.buildMultiplier}
                    onChange={(e) => setWeights({...weights, buildMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">高负载</span>
                </div>
                <div className="setting-item">
                  <label>测试中</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.testMultiplier}
                    onChange={(e) => setWeights({...weights, testMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">中等负载</span>
                </div>
                <div className="setting-item">
                  <label>等待中（等商务）</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.waitBusinessMultiplier}
                    onChange={(e) => setWeights({...weights, waitBusinessMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">低负载</span>
                </div>
                <div className="setting-item">
                  <label>等待中（等客户）</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.waitClientMultiplier}
                    onChange={(e) => setWeights({...weights, waitClientMultiplier: parseFloat(e.target.value) || 0})}
                  />
                  <span className="setting-hint">低负载</span>
                </div>
                <div className="setting-item">
                  <label>未知状态</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    value={weights.unknownMultiplier}
                    onChange={(e) => setWeights({...weights, unknownMultiplier: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div className="settings-actions">
                <button 
                  className="reset-btn"
                  onClick={() => {
                    setWeights({
                      difficultWeight: 3,
                      mediumWeight: 2,
                      easyWeight: 1,
                      maintainMultiplier: 1.0,
                      optimizeMultiplier: 1.5,
                      buildMultiplier: 1.5,
                      testMultiplier: 1.0,
                      waitBusinessMultiplier: 0.3,
                      waitClientMultiplier: 0.3,
                      unknownMultiplier: 0.5
                    });
                  }}
                >
                  重置为默认值
                </button>
                <button 
                  className="apply-btn"
                  onClick={() => {
                    setShowSettings(false);
                    loadData(true);
                  }}
                >
                  应用并重新计算
                </button>
              </div>

              <div className="settings-explanation">
                <p><strong>计算公式：</strong></p>
                <p>项目负载 = 难度权重 × 状态倍数</p>
                <p>PE总负载 = 所有项目负载之和</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
