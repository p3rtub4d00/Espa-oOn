import assert from 'node:assert/strict'
import { test } from 'node:test'
import { uploadGalleryFiles } from '../src/admin/gallery-upload.js'

const file = (name, overrides = {}) => ({ name, type: 'image/jpeg', size: 1000, ...overrides })
const options = overrides => ({ files: [], gallery: ['existing'], uploadImage: async f => ({ id: f.name, url: '/photo/' + f.name }), saveGallery: async gallery => ({ gallery }), readSettings: async () => ({ gallery: ['existing'] }), deleteImage: async () => {}, ...overrides })

test('uploads and saves in selection order without overlapping requests or dropping earlier photos', async () => {
  const history = [], progress = []
  let active = false
  const result = await uploadGalleryFiles(options({
    files: [file('one'), file('two'), file('three')],
    uploadImage: async f => { assert.equal(active, false); active = true; history.push('upload:' + f.name); return { id: f.name, url: '/photo/' + f.name } },
    saveGallery: async gallery => { history.push([...gallery]); active = false; return { gallery } },
    onProgress: p => progress.push(p.current),
  }))
  assert.equal(result.savedCount, 3)
  assert.deepEqual(history[5], ['existing', '/photo/one', '/photo/two', '/photo/three'])
  assert.deepEqual(progress, [1, 2, 3])
  assert.deepEqual(result.failures, [])
})

test('rejects invalid files individually and continues after an upload failure', async () => {
  const uploaded = []
  const result = await uploadGalleryFiles(options({
    files: [file('bad-format', { type: 'image/gif' }), file('too-big', { size: 6 * 1024 * 1024 }), file('empty', { size: 0 }), file('broken'), file('good')],
    uploadImage: async f => { uploaded.push(f.name); if (f.name === 'broken') throw new Error('Falha de rede'); return { id: f.name, url: '/photo/' + f.name } },
  }))
  assert.deepEqual(uploaded, ['broken', 'good'])
  assert.equal(result.savedCount, 1)
  assert.equal(result.failures.length, 4)
})

test('checks gallery capacity before uploading anything', async () => {
  let called = false
  await assert.rejects(uploadGalleryFiles(options({ files: [file('one'), file('two')], gallery: Array(99).fill('existing'), uploadImage: async () => { called = true } })), /100 fotos/)
  assert.equal(called, false)
})

test('a lost save response reconciles the committed gallery and never deletes a saved image', async () => {
  let actual = ['existing'], calls = 0
  const result = await uploadGalleryFiles(options({
    files: [file('one'), file('two')],
    saveGallery: async gallery => { actual = gallery; if (++calls === 1) throw new Error('Lost response'); return { gallery } },
    readSettings: async () => ({ gallery: actual }),
    deleteImage: async () => { assert.fail('Must not delete a linked photo') },
  }))
  assert.equal(result.savedCount, 2)
  assert.deepEqual(actual, ['existing', '/photo/one', '/photo/two'])
})

test('uncommitted save failure stops remaining uploads and cleans up only after confirming the image is unlinked', async () => {
  const deleted = [], uploaded = []
  const result = await uploadGalleryFiles(options({
    files: [file('one'), file('two'), file('three')],
    uploadImage: async f => { uploaded.push(f.name); return { id: f.name, url: '/photo/' + f.name } },
    saveGallery: async () => { throw new Error('Cannot save') },
    deleteImage: async id => deleted.push(id),
  }))
  assert.deepEqual(uploaded, ['one'])
  assert.deepEqual(deleted, ['one'])
  assert.equal(result.remaining, 2)
  assert.equal(result.savedCount, 0)
})

test('uncertain save status does not delete potentially linked photos; expired session stops the batch', async () => {
  const result = await uploadGalleryFiles(options({ files: [file('one'), file('two')], saveGallery: async () => { throw new Error('Network') }, readSettings: async () => { throw new Error('Offline') }, deleteImage: async () => assert.fail('Unsafe cleanup') }))
  assert.equal(result.remaining, 1)
  const expired = await uploadGalleryFiles(options({ files: [file('one'), file('two')], uploadImage: async () => { throw Object.assign(new Error('Entre novamente'), { status: 401 }) } }))
  assert.equal(expired.remaining, 1)
})
