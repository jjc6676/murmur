#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createInterface } from 'node:readline';

const dbPath = process.argv[2];
if (!dbPath) {
  process.stderr.write('Usage: murmur-mcp.mjs <murmur.sqlite>\n');
  process.exit(2);
}
const db = new DatabaseSync(dbPath, { readOnly: true });

const tools = [
  { name: 'search_meetings', description: 'Search Murmur meeting titles, transcripts, notes, and summaries.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'get_meeting', description: 'Get a Murmur meeting by ID.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'list_recent_meetings', description: 'List recent Murmur meetings.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 } }, additionalProperties: false } },
];

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function meeting(row) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    durationSec: row.durationSec,
    myNotes: row.myNotes,
    transcript: parseJson(row.transcript, []),
    summary: parseJson(row.summary, null),
    summaryStatus: row.summaryStatus,
    importSource: row.importSource,
  };
}

function callTool(name, args) {
  if (name === 'search_meetings') {
    const query = String(args?.query ?? '').trim();
    if (!query) throw new Error('query is required');
    const like = `%${query}%`;
    return db.prepare('SELECT * FROM meetings WHERE isDeleted = 0 AND (title LIKE ? OR searchable LIKE ?) ORDER BY createdAt DESC LIMIT 50').all(like, like).map(meeting);
  }
  if (name === 'get_meeting') {
    const id = String(args?.id ?? '');
    const row = db.prepare('SELECT * FROM meetings WHERE id = ? AND isDeleted = 0').get(id);
    if (!row) throw new Error('Meeting not found');
    return meeting(row);
  }
  if (name === 'list_recent_meetings') {
    const limit = Math.max(1, Math.min(100, Number(args?.limit ?? 10) || 10));
    return db.prepare('SELECT * FROM meetings WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT ?').all(limit).map(meeting);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, error) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request.id === undefined) return;
  try {
    if (request.method === 'initialize') respond(request.id, { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'murmur', version: '0.1.0' } });
    else if (request.method === 'tools/list') respond(request.id, { tools });
    else if (request.method === 'tools/call') respond(request.id, { content: [{ type: 'text', text: JSON.stringify(callTool(request.params?.name, request.params?.arguments), null, 2) }] });
    else fail(request.id, new Error(`Method not found: ${request.method}`));
  } catch (error) { fail(request.id, error); }
});

process.on('exit', () => db.close());
