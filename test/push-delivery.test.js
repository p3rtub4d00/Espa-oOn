import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deliverPushBatch } from '../server/push-delivery.js'

const subscriptions = Array.from({ length: 7 }, (_, i) => ({ endpoint: String(i), keys: { auth: 'test', p256dh: 'test' } }))
const noop = async () => {}

test('a slow device does not delay the others; concurrency stays bounded and sends are high priority', async () => {
  let release
  const slow = new Promise(resolve => { release = resolve })
  const started = [], succeeded = []
  let active = 0, maximum = 0
  const resultPromise = deliverPushBatch(subscriptions, { title: 'Test' }, {
    send: async (s, message, options) => {
      assert.deepEqual(options, { urgency: 'high', timeout: 10000 })
      assert.equal(JSON.parse(message).title, 'Test')
      started.push(s.endpoint); active++; maximum = Math.max(maximum, active)
      if (s.endpoint === '0') await slow
      else await Promise.resolve()
      active--
    },
    onSuccess: async s => succeeded.push(s.endpoint), onFailure: noop,
  })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(started.length, 7)
    assert.equal(succeeded.includes('0'), false)
    assert.equal(succeeded.length, 6)
    assert.ok(maximum > 1 && maximum <= 4)
  } finally { release() }
  assert.deepEqual(await resultPromise, { sent: 7, failed: 0 })
  assert.equal(new Set(started).size, 7)
})

test('failed sends are isolated and expired subscriptions remain distinguishable', async () => {
  const failed = []
  const result = await deliverPushBatch(subscriptions.slice(0, 3), {}, {
    send: async s => { if (s.endpoint !== '2') throw Object.assign(new Error('failure'), { statusCode: s.endpoint === '0' ? 410 : 503 }) },
    onSuccess: noop, onFailure: async (s, error) => failed.push([s.endpoint, error.statusCode]),
  })
  assert.deepEqual(result, { sent: 1, failed: 2 })
  assert.deepEqual(failed.sort(), [['0', 410], ['1', 503]])
})

test('tracking errors do not resend accepted messages or stop remaining devices', async () => {
  let trackedErrors = 0, sends = 0
  const result = await deliverPushBatch(subscriptions, {}, {
    send: async () => { sends++ }, onSuccess: async () => { throw new Error('Database') }, onFailure: noop, onTrackingError: () => { trackedErrors++ },
  })
  assert.deepEqual(result, { sent: 7, failed: 0 })
  assert.equal(sends, 7)
  assert.equal(trackedErrors, 7)
  assert.deepEqual(await deliverPushBatch([], {}, { send: () => assert.fail('Empty batch'), onSuccess: noop, onFailure: noop }), { sent: 0, failed: 0 })
})
