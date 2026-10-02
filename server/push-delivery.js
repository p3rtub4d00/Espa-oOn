// Ask the push provider to deliver promptly, with a bounded socket inactivity timeout.
export const PUSH_SEND_OPTIONS = Object.freeze({ urgency: 'high', timeout: 10000 })
const CONCURRENCY = 4

export async function deliverPushBatch(subscriptions, payload, { send, onSuccess, onFailure, onTrackingError }) {
  const message = JSON.stringify(payload)
  let next = 0
  let sent = 0
  let failed = 0
  async function worker() {
    while (next < subscriptions.length) {
      const subscription = subscriptions[next++]
      let error
      try {
        await send({ endpoint: subscription.endpoint, keys: subscription.keys }, message, PUSH_SEND_OPTIONS)
        sent++
      } catch (failure) { error = failure; failed++ }
      // A database tracking failure must not turn an accepted push into a failed send.
      try {
        if (error) await onFailure(subscription, error)
        else await onSuccess(subscription)
      } catch { onTrackingError?.() }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, subscriptions.length) }, worker))
  return { sent, failed }
}
