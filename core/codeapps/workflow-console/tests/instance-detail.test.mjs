import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectPages, sortSteps, forStep, stepDuration, textKind, safeFileUrl, outputText,
} from '../src/features/instances/instance-detail-model.ts'

test('all pages are collected and duplicate IDs are replaced', async () => {
  const rows = await collectPages(async (token) => ({
    success: true,
    data: token ? [{ id: '0' }, { id: '25' }] : Array.from({ length: 25 }, (_, index) => ({ id: String(index) })),
    skipToken: token ? undefined : 'next',
  }), (row) => row.id)
  assert.equal(rows.length, 26)
})

test('page errors and repeated tokens fail instead of returning partial records', async () => {
  await assert.rejects(collectPages(async () => ({ success: true, data: [], skipToken: 'same' }), () => ''), /Repeated/)
  await assert.rejects(collectPages(async (token) => token
    ? { success: false, error: { message: 'Access denied' } }
    : { success: true, data: [{ id: '1' }], skipToken: 'next' }, (row) => row.id), /Access denied/)
})

test('step ordering handles missing/invalid times and retains duplicate names', () => {
  const rows = [
    { faf001_bpstepid: 'z', faf001_stepname: 'Review' },
    { faf001_bpstepid: 'b', faf001_stepname: 'Review', faf001_starttime: 'invalid', createdon: '2026-09-02' },
    { faf001_bpstepid: 'a', faf001_starttime: '2026-09-01' },
  ]
  assert.deepEqual(sortSteps(rows).map((row) => row.faf001_bpstepid), ['a', 'b', 'z'])
  assert.equal(rows[0].faf001_bpstepid, 'z')
})

test('only direct step links group content; unlinked records are retained in source', () => {
  const rows = [{ _faf001_bpstepid_value: 'REVIEW' }, { _faf001_bpstepid_value: 'raising-step' }, {}]
  assert.deepEqual(forStep(rows, 'review'), [rows[0]])
  assert.equal(rows.length, 3)
})

test('durations reject invalid, absent or negative timestamps', () => {
  assert.equal(stepDuration('2026-09-01T00:00:00Z', '2026-09-01T01:02:00Z'), '1h 2m')
  assert.equal(stepDuration('invalid', '2026-09-01'), '--')
  assert.equal(stepDuration('2026-09-02', '2026-09-01'), '--')
  assert.equal(stepDuration(), '--')
})

test('text classification allows text/json/markdown but rejects binaries and active documents', () => {
  assert.equal(textKind('OUTPUT.JSON', 'Application/JSON; charset=utf-8'), 'json')
  assert.equal(textKind('output', 'application/problem+json'), 'json')
  assert.equal(textKind('notes.md', 'application/octet-stream'), 'markdown')
  assert.equal(textKind('notes.txt'), 'text')
  for (const name of ['file.pdf', 'file.docx', 'file.xlsx', 'image.png', 'page.html', 'image.svg', 'file.zip']) {
    assert.equal(textKind(name, 'text/plain'), undefined, name)
  }
  assert.equal(textKind('file.txt', 'application/pdf'), undefined)
  assert.equal(textKind('unknown.bin'), undefined)
})

test('URLs reject scripts, data, credentials and relative paths', () => {
  for (const url of ['javascript:alert(1)', 'data:text/plain,test', '/file', 'https://user:secret@example.com']) {
    assert.equal(safeFileUrl(url), undefined)
  }
  assert.equal(safeFileUrl('https://example.com/file'), 'https://example.com/file')
})

test('typed outputs preserve false, zero, blank, JSON null and malformed JSON', () => {
  assert.equal(outputText({ faf001_datatype: 324010002, faf001_valueboolean: false }), 'false')
  assert.equal(outputText({ faf001_datatype: 324010001, faf001_valuenumber: 0 }), '0')
  assert.equal(outputText({ faf001_datatype: 324010000, faf001_valuetext: '' }), '')
  assert.equal(outputText({ faf001_datatype: 324010004, faf001_valuejson: 'null' }), 'null')
  assert.equal(outputText({ faf001_datatype: 324010004, faf001_valuejson: '{bad' }), '{bad')
  assert.equal(outputText({ faf001_datatype: 324010004, faf001_valuejson: '{"ok":true}' }), '{\n  "ok": true\n}')
  assert.equal(outputText({ faf001_datatype: 324010001 }), '--')
})