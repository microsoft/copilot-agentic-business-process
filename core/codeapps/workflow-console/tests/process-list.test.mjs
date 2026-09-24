import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadProcessList } from '../src/features/instances/process-list-model.ts'

const row = (id, status, modifiedon) => ({ faf001_bpinstanceid: id, faf001_status: status, modifiedon })
const page = (rows, token) => ({ success: true, data: {
  faf001_Processes: rows, faf001_HasMore: Boolean(token), faf001_NextToken: token ?? '',
} })

test('process list follows API tokens, filters multiple statuses and sorts by last updated, not creation', async () => {
  const calls = []
  const result = await loadProcessList(async (body) => {
    calls.push(body)
    return body.faf001_ContinuationToken
      ? page([{ ...row('new', 2, '2026-09-10'), createdon: '2026-08-01' }, row('hidden', 3, '2026-09-11')])
      : page([{ ...row('old', 1, '2026-09-01'), createdon: '2026-09-01' }], 'next')
  }, [1, 2])
  assert.deepEqual(result.map((item) => item.faf001_bpinstanceid), ['new', 'old'])
  assert.deepEqual(calls, [
    { faf001_PageSize: 200 },
    { faf001_PageSize: 200, faf001_ContinuationToken: 'next' },
  ])
})

test('All returns the 200 most recently updated after collecting all pages, while an empty filter returns none', async () => {
  const older = Array.from({ length: 200 }, (_, index) => row(String(index), 1, '2026-09-01'))
  const invoke = async (body) => body.faf001_ContinuationToken
    ? page([row('newest', 3, '2026-09-10')]) : page(older, 'next')
  const result = await loadProcessList(invoke, null)
  assert.equal(result.length, 200)
  assert.equal(result[0].faf001_bpinstanceid, 'newest')
  assert.deepEqual(await loadProcessList(invoke, []), [])
})

test('empty results are valid and duplicate records are merged', async () => {
  assert.deepEqual(await loadProcessList(async () => page([]), null), [])
  const result = await loadProcessList(async (body) => body.faf001_ContinuationToken
    ? page([row('same', 2, '2026-09-10')]) : page([row('same', 1, '2026-09-01')], 'next'), null)
  assert.equal(result.length, 1)
  assert.equal(result[0].faf001_status, 2)
})

test('equal timestamps use ID ordering and missing or invalid timestamps sort last', async () => {
  const result = await loadProcessList(async () => page([
    row('missing', 1),
    row('beta', 1, '2026-09-11T10:00:00Z'),
    row('invalid', 1, 'invalid'),
    row('alpha', 1, '2026-09-11T10:00:00Z'),
  ]), null)
  assert.deepEqual(result.map((item) => item.faf001_bpinstanceid), ['alpha', 'beta', 'invalid', 'missing'])
})

test('API errors, malformed responses and bad tokens fail instead of displaying partial results', async () => {
  await assert.rejects(loadProcessList(async (body) => body.faf001_ContinuationToken
    ? { success: false, error: { message: 'Access denied' } } : page([row('old', 1)], 'next'), null), /Access denied/)
  for (const data of [undefined, {}, { faf001_Processes: [], faf001_HasMore: true }]) {
    await assert.rejects(loadProcessList(async () => ({ success: true, data }), null), /response|continuation token/)
  }
  await assert.rejects(loadProcessList(async () => page([], 'same'), null), /Repeated page token/)
})