import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../services/api';
import './PEGanttChart.css';

// Color per 客户状态, reused visual language from the main dashboard's status legend.
const STATUS_COLORS = {
  '搭建中': '#f6ad55',
  '测试中': '#ecc94b',
  '调优中': '#9f7aea',
  '维护中': '#4299e1',
  '等待中（等商务）': '#cbd5e0',
  '等待中（等客户）': '#a0aec0',
  '未知状态': '#718096'
};

// Pseudo-status used when a project's 客户状态 became 已流失/封号. Per requirement,
// projects that have ended (endedAt set) or whose 项目难度等级 is 流失 are excluded
// entirely from the chart, so this should never actually render — kept only as a
// defensive fallback in case a run's segments contain this marker unexpectedly.
const ENDED_STATUS = '__ended__';
const ENDED_COLOR = '#e2e8f0';

// Colors for 项目难度等级, shown as a label after each project's Gantt row.
const DIFFICULTY_COLORS = {
  '高难项目': '#e53e3e',
  '中等项目': '#dd6b20',
  '简单项目': '#38a169',
  '流失': '#a0aec0'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_BEFORE = 10;
const DAYS_AFTER = 0;
const WINDOW_DAYS = DAYS_BEFORE + DAYS_AFTER + 1; // 10 days before today + today
const POLL_MS = 30000; // matches the app's existing 30s silent refresh cadence
const CELL_WIDTH_PX = 88; // one day = one square, wide enough to show the 客户状态 label

function toDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDayLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Formats using LOCAL date components (not toISOString, which converts to UTC and
// can shift the displayed date by a day depending on timezone offset — e.g. local
// midnight in UTC+8 is still the previous day in UTC). Must stay consistent with
// formatDayLabel, which also uses local getMonth()/getDate().
function formatFullDate(d) {
  if (!d) return '进行中';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Determines which single status applies to a given day, for a project whose
// segments are sorted chronologically ascending by start.
//
// A day takes on the status of the most recent segment whose 变更时间 (start) had
// already occurred by that day — so the day of a status change is filled entirely
// with the NEW status, and the PREVIOUS status is shown through the day right
// before that (never split between the two on the same day).
//
// This applies even when the next recorded change is dated in the future: if we
// already know a project's status will change on some future date, the current
// status correctly fills every day up through the day before that future change.
//
// The only case that stays blank into the future is the project's latest known
// segment (the one with no recorded successor) once we get past today — we don't
// extrapolate an indefinitely-open-ended "current" status forward, since we don't
// actually know it'll still hold on any given future day.
function getStatusForDay(sortedSegments, day, today) {
  let matchIndex = -1;

  for (let i = 0; i < sortedSegments.length; i++) {
    const segStartDay = startOfDay(sortedSegments[i].start);
    if (segStartDay <= day) {
      matchIndex = i;
    } else {
      break;
    }
  }

  if (matchIndex === -1) return null;

  const matchedSegment = sortedSegments[matchIndex];
  const isLatestSegment = matchIndex === sortedSegments.length - 1;
  const matchedSegmentStartDay = startOfDay(matchedSegment.start);

  // Only refuse to extrapolate when the matched segment is BOTH the latest known
  // segment AND already started on/before today (i.e. it's the open-ended
  // "current status" with no recorded end) — don't assume it still holds on a
  // future day just because nothing else is recorded yet.
  //
  // If the matched segment's own start date is in the future (a change already
  // recorded for a later date), it should render starting from its own start day
  // onward, even though it's also the latest segment.
  const isOpenEndedCurrentStatus = isLatestSegment && matchedSegmentStartDay.getTime() <= today.getTime();

  if (isOpenEndedCurrentStatus && day.getTime() > today.getTime()) {
    return null;
  }

  return matchedSegment.status;
}

// Groups consecutive days that share the same status into a single run, so
// same-colored boxes are merged into one wider block labeled once with the
// 客户状态, instead of repeating the label in every individual day square.
function buildDayRuns(dayTicks, sortedSegments, today) {
  const runs = [];
  dayTicks.forEach(day => {
    const status = getStatusForDay(sortedSegments, day, today);
    const last = runs[runs.length - 1];
    if (last && last.status === status) {
      last.length += 1;
    } else {
      runs.push({ status, length: 1 });
    }
  });
  return runs;
}

/**
 * PE 个人项目维度甘特图
 *
 * Data source: GET /api/pe-gantt, which is derived live from the same in-memory
 * dataStore that server/index.js refreshes on every sync (auto every SYNC_INTERVAL
 * minutes, or on manual sync). This component polls that endpoint every 30s so it
 * stays in sync with the 数据表 without a page reload.
 *
 * Row grouping: PE -> project (one row per project, since one project has exactly one PE).
 * Bar: one segment per known 客户状态 period for that project.
 *   - Today, each project only has a single segment (its current status), because the
 *     change-history log table hasn't started accumulating data yet.
 *   - Once server/ganttService.js is extended to read from a persisted change log,
 *     each project's `segments` can hold multiple entries and this component will
 *     render them side-by-side automatically — no changes needed here.
 * End of bar: "now" for active projects, or the moment 客户状态 became 已流失/封号.
 *
 * Timeline: fixed window, 10 days before today through today (11 days total,
 * day-level ticks). Not pannable — projects/segments with no overlap in this
 * range are not shown at all.
 *
 * When a 客户状态 change is recorded, the PREVIOUS status continues filling every
 * day up through the day before the new 变更时间 (even if that change is dated in
 * the future) — the two statuses never share or split a single day square.
 *
 * The only status that does NOT get extrapolated forward is the project's latest
 * known status once there's no recorded successor for it — it fills up through
 * today, then future days are left blank rather than assuming it still holds.
 * If a later change is already on record (even dated in the future), that status
 * is shown starting exactly on its own start day, same as any other transition.
 *
 * After each project's bar row, a 难度 (项目难度等级) badge is shown, sourced from
 * the same change-history table.
 *
 * Projects that have ended (客户状态 reached 已流失/封号) or whose 项目难度等级 is
 * 流失 are excluded from the chart entirely, not just visually de-emphasized.
 */
export default function PEGanttChart() {
  const [projects, setProjects] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedPEs, setCollapsedPEs] = useState(new Set());

  // Fixed window: 10 days before today through today. Not pannable — data outside
  // this range is intentionally not shown.
  const { today, windowStart, windowEnd } = useMemo(() => {
    const t = startOfDay(new Date());
    return {
      today: t,
      windowStart: new Date(t.getTime() - DAYS_BEFORE * DAY_MS),
      windowEnd: new Date(t.getTime() + (DAYS_AFTER + 1) * DAY_MS)
    };
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getPEGantt();
      setProjects(data.projects || []);
      setLastSync(data.lastSync || null);
    } catch (err) {
      setError(err.message || '加载甘特图数据失败');
      console.error('Error loading PE Gantt data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), POLL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const { groups } = useMemo(() => {
    const now = new Date();

    const normalized = projects
      // Drop projects that have ended (已流失/封号) or whose 项目难度等级 is 流失
      // — these are considered closed out and shouldn't be shown at all.
      .filter(p => !p.endedAt && p.difficulty !== '流失')
      .map(p => ({
        ...p,
        segments: p.segments
          .map(seg => ({
            status: seg.status,
            start: toDate(seg.start),
            end: toDate(seg.end) // null = still active
          }))
          // Only keep segments that overlap the fixed visible window
          .filter(seg => seg.start && (seg.end ? seg.end >= windowStart : true) && seg.start < windowEnd)
      }))
      // Drop projects with no segment overlapping the window at all
      .filter(p => p.segments.length > 0);

    const byPE = new Map();
    normalized.forEach(p => {
      if (!byPE.has(p.pe)) byPE.set(p.pe, []);
      byPE.get(p.pe).push(p);
    });

    const groupsArr = Array.from(byPE.entries())
      .map(([pe, projs]) => ({
        pe,
        projects: projs.slice().sort((a, b) => {
          const aStart = a.segments[0]?.start || now;
          const bStart = b.segments[0]?.start || now;
          return aStart - bStart;
        })
      }))
      .sort((a, b) => b.projects.length - a.projects.length);

    return { groups: groupsArr };
  }, [projects, windowStart, windowEnd]);

  // Day ticks across the fixed visible window (one entry per square)
  const dayTicks = useMemo(() => {
    const ticks = [];
    const cursor = new Date(windowStart);
    for (let i = 0; i < WINDOW_DAYS; i++) {
      ticks.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return ticks;
  }, [windowStart]);

  const toggleCollapse = (pe) => {
    setCollapsedPEs(prev => {
      const next = new Set(prev);
      if (next.has(pe)) next.delete(pe);
      else next.add(pe);
      return next;
    });
  };

  const statusesInUse = useMemo(() => {
    const set = new Set();
    groups.forEach(g => g.projects.forEach(p => p.segments.forEach(seg => set.add(seg.status))));
    return Array.from(set).filter(s => STATUS_COLORS[s]);
  }, [groups]);

  const totalProjects = useMemo(
    () => groups.reduce((sum, g) => sum + g.projects.length, 0),
    [groups]
  );
  const totalPEs = groups.length;

  if (loading) {
    return (
      <div className="pe-gantt">
        <div className="pe-gantt-loading">加载甘特图数据中...</div>
      </div>
    );
  }

  return (
    <div className="pe-gantt">
      <div className="pe-gantt-header-bar">
        <h2>PE 个人项目维度甘特图</h2>
        <div className="pe-gantt-summary">
          {totalPEs} 位 PE · {totalProjects} 个项目
          {lastSync && <span className="pe-gantt-last-sync"> · 最后同步: {new Date(lastSync).toLocaleString('zh-CN')}</span>}
        </div>
      </div>

      {error && (
        <div className="pe-gantt-error">⚠️ {error}</div>
      )}

      <div className="pe-gantt-legend">
        {statusesInUse.map(status => (
          <div key={status} className="pe-gantt-legend-item">
            <span className="pe-gantt-legend-dot" style={{ backgroundColor: STATUS_COLORS[status] }} />
            <span>{status}</span>
          </div>
        ))}
      </div>

      <div className="pe-gantt-nav">
        <span className="pe-gantt-range-label">
          显示范围: {formatFullDate(windowStart)} ~ {formatFullDate(new Date(windowEnd.getTime() - DAY_MS))}
        </span>
      </div>

      {totalProjects === 0 ? (
        <div className="pe-gantt-empty">暂无项目数据，请检查飞书多维表格配置或触发同步</div>
      ) : (
        <div className="pe-gantt-scroll">
          <div className="pe-gantt-table">
            {/* Timeline header */}
            <div className="pe-gantt-row pe-gantt-header-row">
              <div className="pe-gantt-label-col pe-gantt-label-header">PE / 项目</div>
              <div className="pe-gantt-timeline-col pe-gantt-timeline-header" style={{ width: `${WINDOW_DAYS * CELL_WIDTH_PX}px` }}>
                {dayTicks.map((tick, idx) => (
                  <div
                    key={idx}
                    className={`pe-gantt-day-cell pe-gantt-day-tick ${isSameDay(tick, today) ? 'is-today' : ''}`}
                    style={{ width: `${CELL_WIDTH_PX}px` }}
                  >
                    {formatDayLabel(tick)}
                  </div>
                ))}
              </div>
              <div className="pe-gantt-difficulty-col pe-gantt-difficulty-header">难度</div>
            </div>

            {/* PE groups */}
            {groups.map(group => {
              const collapsed = collapsedPEs.has(group.pe);
              return (
                <div key={group.pe} className="pe-gantt-group">
                  <div
                    className="pe-gantt-row pe-gantt-pe-row"
                    onClick={() => toggleCollapse(group.pe)}
                  >
                    <div className="pe-gantt-label-col pe-gantt-pe-label">
                      <span className="pe-gantt-collapse-icon">{collapsed ? '▶' : '▼'}</span>
                      {group.pe}
                      <span className="pe-gantt-pe-count">({group.projects.length})</span>
                    </div>
                    <div className="pe-gantt-timeline-col" style={{ width: `${WINDOW_DAYS * CELL_WIDTH_PX}px` }} />
                    <div className="pe-gantt-difficulty-col" />
                  </div>

                  {!collapsed && group.projects.map(proj => {
                    const sortedSegments = proj.segments.slice().sort((a, b) => a.start - b.start);
                    const runs = buildDayRuns(dayTicks, sortedSegments, today);
                    return (
                      <div key={proj.recordId} className="pe-gantt-row pe-gantt-project-row">
                        <div className="pe-gantt-label-col pe-gantt-project-label" title={proj.project}>
                          {proj.project}
                        </div>
                        <div className="pe-gantt-timeline-col" style={{ width: `${WINDOW_DAYS * CELL_WIDTH_PX}px` }}>
                          {runs.map((run, runIdx) => {
                            const runWidth = run.length * CELL_WIDTH_PX;
                            if (!run.status) {
                              return (
                                <div
                                  key={runIdx}
                                  className="pe-gantt-day-cell pe-gantt-day-cell-empty"
                                  style={{ width: `${runWidth}px` }}
                                />
                              );
                            }
                            const isEnded = run.status === ENDED_STATUS;
                            const color = isEnded ? ENDED_COLOR : (STATUS_COLORS[run.status] || '#a0aec0');
                            return (
                              <div
                                key={runIdx}
                                className={`pe-gantt-day-cell pe-gantt-status-cell ${isEnded ? 'pe-gantt-status-cell-ended' : ''}`}
                                style={{ width: `${runWidth}px`, backgroundColor: color }}
                                title={`${proj.project} | ${isEnded ? '已结束' : run.status}`}
                              >
                                {!isEnded && <span className="pe-gantt-status-cell-label">{run.status}</span>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="pe-gantt-difficulty-col">
                          {proj.difficulty && (
                            <span
                              className="pe-gantt-difficulty-badge"
                              style={{
                                color: DIFFICULTY_COLORS[proj.difficulty] || '#718096',
                                borderColor: DIFFICULTY_COLORS[proj.difficulty] || '#718096'
                              }}
                            >
                              {proj.difficulty}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
