import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindDeploymentDatabase } from '../server/deployment-identity.js'

test('a new database is bound to the club and the same club can restart', async () => {
  let stored
  const Identity = { findOneAndUpdate(filter, update, options) {
    assert.deepEqual(filter, { _id: 'main' })
    assert.equal(options.upsert, true)
    assert.equal(options.new, true)
    stored ||= { ...update.$setOnInsert }
    return { lean: async () => stored }
  } }
  await bindDeploymentDatabase(Identity, 'CLB-A')
  await bindDeploymentDatabase(Identity, 'CLB-A')
  await assert.rejects(bindDeploymentDatabase(Identity, 'CLB-B'), /banco pertence a outro clube/)
  assert.equal(stored.clubId, 'CLB-A')
})

test('a connection failure is propagated instead of assuming the database is safe', async () => {
  const Identity = { findOneAndUpdate() { return { lean: async () => { throw new Error('database unavailable') } } } }
  await assert.rejects(bindDeploymentDatabase(Identity, 'CLB-A'), /database unavailable/)
})


test('concurrent first-boot upserts verify the winning database identity', async () => {
  const Identity = {
    findOneAndUpdate: () => ({ lean: async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }) } }),
    findById: () => ({ lean: async () => ({ clubId: 'CLB-A' }) }),
  }
  await bindDeploymentDatabase(Identity, 'CLB-A')
  await assert.rejects(bindDeploymentDatabase(Identity, 'CLB-B'), /banco pertence a outro clube/)
})


test('a new database is not bound while the initial license is invalid or unavailable', async () => {
  let writes=0
  const Identity = {
    findById: () => ({ lean: async () => null }),
    findOneAndUpdate: () => { writes++; return { lean: async () => ({clubId:'CLB-A'}) } },
  }
  for (const license of [{status:'invalid_license'}, {unavailable:true}]) {
    await assert.rejects(bindDeploymentDatabase(Identity, 'CLB-A', {verifyLicense:async()=>license}), /validar a licença/)
  }
  assert.equal(writes,0)
  await bindDeploymentDatabase(Identity, 'CLB-A', {verifyLicense:async()=>({status:'active',unavailable:false})})
  assert.equal(writes,1)
})
