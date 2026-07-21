// Builds PE 个人项目维度甘特图 data from a dedicated Feishu 变更历史记录表
// (change-history log table), configured via FEISHU_GANTT_WIKI_NODE +
// FEISHU_GANTT_TABLE_ID in .env. This table is intentionally separate from the
// FEISHU_BITABLE_IDS used by the rest of the dashboard (PE stats, etc.) — the
// Gantt chart only ever reads from this one specific table, per requirement.
//
// Table schema (as configured in Feishu):
//   项目       Text        - project name
//   PE         User        - PE responsible at the time of this log entry
//   变更时间    DateTime    - when the status below took effect
//   起始状态    SingleSelect - baseline status (first known status for a project)
//   变更状态    SingleSelect - a later detected status change
//   项目难度等级 SingleSelect - project difficulty (中等项目/简单项目/高难项目/流失),
//               shown as a label after each Gantt row rather than as a bar segment
//
// Each row is one point-in-time status event. This module reconstructs, per
// project, the sequence of {status, start, end} segments a PE progressed through
// (e.g. 搭建中 → 测试中 → 维护中), by sorting all events for a project by 变更时间
// and turning each consecutive pair into a segment. If the PE responsible changes
// partway through (project reassignment), the event stream is split into separate
// per-PE "runs", each producing its own bar under its own PE.
//
// 已流失/封号 are never rendered as their own colored/labeled segment — reaching
// either status ends the project. The previous segment (if any) is closed at that
// event's timestamp; if there is no previous segment (the very first known event
// for a run is already 已流失/封号), a neutral "ended" segment is emitted instead
// of fabricating a status.
const feishuApi = require('./feishuApi');

const CLOSED_STATUSES = ['已流失', '封号'];
const ENDED_STATUS = '__ended__';

const CACHE_TTL_MS = 20000; // avoid re-fetching from Feishu on every client poll
let cache = { data: null, fetchedAt: 0 };
let cachedAppToken = null;

function getStatus(fields) {
  return fields['起始状态'] || fields['变更状态'] || null;
}

function getDifficulty(fields) {
  return fields['项目难度等级'] || null;
}

function getEventTime(record) {
  return record.fields['变更时间'] || record.created_time || null;
}

// Turns a project's full chronological event list (across all PEs) into bar
// segments, where each segment's `end` is the start time of the very next event
// GLOBALLY — regardless of which PE that next event belongs to. This ensures a
// PE's segment is correctly closed the moment ANY later event occurs (including a
// reassignment to a different PE), instead of staying open-ended just because no
// later event happened to fall under that same PE.
//
// Segments are then grouped into per-PE runs (contiguous stretches under the same
// PE) for rendering as separate Gantt rows when a genuine reassignment occurs.
function buildSegmentsAndRuns(events) {
  const rawSegments = [];
  let endedAt = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const next = events[i + 1];
    const nextTime = next ? next.time : null;

    if (CLOSED_STATUSES.includes(ev.status)) {
      // Close out whatever segment came before, or if this is the very first
      // event overall, there's nothing to close — emit a neutral marker instead
      // of fabricating a status.
      if (rawSegments.length > 0) {
        rawSegments[rawSegments.length - 1].end = ev.time;
      } else {
        rawSegments.push({ pe: ev.pe, status: ENDED_STATUS, start: ev.time, end: ev.time });
      }
      endedAt = ev.time;
      break; // project is done; ignore any further events
    }

    rawSegments.push({ pe: ev.pe, status: ev.status, start: ev.time, end: nextTime });
  }

  // Group consecutive segments that share the same PE into runs.
  const runs = [];
  rawSegments.forEach(seg => {
    const last = runs[runs.length - 1];
    if (last && last.pe === seg.pe) {
      last.segments.push({ status: seg.status, start: seg.start, end: seg.end });
    } else {
      runs.push({ pe: seg.pe, segments: [{ status: seg.status, start: seg.start, end: seg.end }] });
    }
  });

  return { runs, endedAt };
}

async function fetchChangeLogRecords() {
  const wikiNode = process.env.FEISHU_GANTT_WIKI_NODE;
  const tableId = process.env.FEISHU_GANTT_TABLE_ID;

  if (!wikiNode || !tableId) {
    throw new Error('FEISHU_GANTT_WIKI_NODE and FEISHU_GANTT_TABLE_ID must be set in .env');
  }

  const token = await feishuApi.getAccessToken();

  if (!cachedAppToken) {
    cachedAppToken = await feishuApi.resolveWikiNodeAppToken(token, wikiNode);
  }

  try {
    return await feishuApi.getTableRecords(token, cachedAppToken, tableId);
  } catch (error) {
    // app_token resolution might be stale (e.g. base was moved); retry once
    // with a fresh resolution before giving up.
    cachedAppToken = await feishuApi.resolveWikiNodeAppToken(token, wikiNode);
    return await feishuApi.getTableRecords(token, cachedAppToken, tableId);
  }
}

async function buildGanttData() {
  const now = Date.now();

  if (cache.data && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }

  const records = await fetchChangeLogRecords();

  // Flatten into simple events: { project, pe, time, status, difficulty }
  const events = [];
  records.forEach(record => {
    const fields = record.fields || {};
    const projectName = fields['项目'];
    const peArray = fields['PE'];
    const status = getStatus(fields);
    const time = getEventTime(record);

    if (!projectName || !peArray || peArray.length === 0 || !status || !time) return;

    events.push({
      project: projectName,
      pe: peArray[0].name || peArray[0].en_name || 'Unknown PE',
      time,
      status,
      difficulty: getDifficulty(fields)
    });
  });

  // Group events by project name, sort chronologically within each project
  const byProject = new Map();
  events.forEach(ev => {
    if (!byProject.has(ev.project)) byProject.set(ev.project, []);
    byProject.get(ev.project).push(ev);
  });

  const projects = [];
  byProject.forEach((projectEvents, projectName) => {
    const sorted = projectEvents.slice().sort((a, b) => a.time - b.time);
    const { runs, endedAt } = buildSegmentsAndRuns(sorted);

    // Only the LAST run should carry endedAt (the project only actually "ends"
    // once, at the very end of its event stream) — earlier runs were closed out
    // by a normal reassignment, not by 已流失/封号.
    runs.forEach((run, runIdx) => {
      if (run.segments.length === 0) return;

      const isLastRun = runIdx === runs.length - 1;

      // Use the most recent non-null 项目难度等级 among events belonging to this PE.
      const difficultyEvents = sorted.filter(ev => ev.pe === run.pe && ev.difficulty);
      const difficulty = difficultyEvents.length > 0
        ? difficultyEvents[difficultyEvents.length - 1].difficulty
        : null;

      projects.push({
        recordId: `${projectName}__${run.pe}__${runIdx}`,
        project: projectName,
        pe: run.pe,
        segments: run.segments,
        endedAt: isLastRun ? endedAt : null,
        difficulty
      });
    });
  });

  const result = {
    projects,
    lastSync: new Date(now).toISOString()
  };

  cache = { data: result, fetchedAt: now };
  return result;
}

module.exports = {
  buildGanttData
};
