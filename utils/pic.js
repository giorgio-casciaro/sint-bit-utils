const kvDb = require('./kvDb')
const fs = require('fs')
const path = require('path')
const uuid = require('uuid/v4')

const CONSOLE = require('./utils').getConsole({error: true, debug: true, log: true, warn: true}, 'NPM_PIC', 'NPM_PIC', 'NPM_PIC')
const getPicPath = (uploadPath, id, type = 'mini', format = 'jpeg') => path.join(uploadPath, `pic-${type}-${id}.${format}`)
const unlinkFile = (file) => new Promise((resolve, reject) => fs.unlink(file, (err, data) => err ? resolve(err) : resolve(data)))
const saveFileInDb = (aerospikeConfig, kvDbClient, file, id = uuid()) => new Promise((resolve, reject) => {
  const XXHash = require('xxhash')
  var chunkSize = 1024 * 32
  var chunkIt = fs.statSync(file).size > chunkSize
  // CONSOLE.log('saveFileInDb', chunkIt, chunkSize)
  var stream = fs.createReadStream(file)
  var chunks = []
  CONSOLE.hl('saveFileInDb', chunkIt, file, id)
  stream.on('data', async function (chunk) {
    try {
      if (chunkIt) {
        var chunkId = XXHash.hash(chunk, 0xCAFEBABE)
        var key = kvDb.key(aerospikeConfig.namespace, aerospikeConfig.filesChunksSet, chunkId)
        chunks.push(chunkId)
        await kvDb.put(kvDbClient, key, {chunk})
      } else {
        chunks = chunk
      }
    } catch (error) {
      reject(error)
    }
  })
  stream.on('end', async function () {
    try {
      var key = kvDb.key(aerospikeConfig.namespace, aerospikeConfig.filesSet, id)
      var dbFile = {id, chunks}
      CONSOLE.hl('saveFileInDb end', dbFile)
      await kvDb.put(kvDbClient, key, dbFile)
    } catch (error) {
      reject(error)
    }
    resolve({id, chunks})
  })
})
const readFileInDb = async (aerospikeConfig, kvDbClient, id) => {
  var key = kvDb.key(aerospikeConfig.namespace, aerospikeConfig.filesSet, id)
  var dbFile = await kvDb.get(kvDbClient, key)
  CONSOLE.hl('readFileInDb  ', dbFile, (dbFile.chunks instanceof Buffer))
  if (dbFile && dbFile.chunks) {
    if (dbFile.chunks instanceof Buffer) return dbFile.chunks // SINGLE CHUNK
    var chunksPromises = dbFile.chunks.map((chunkId) => kvDb.get(kvDbClient, kvDb.key(aerospikeConfig.namespace, aerospikeConfig.filesChunksSet, chunkId)))
    var allChunks = await Promise.all(chunksPromises)
    var complete = allChunks.reduce((a, b) => Buffer.concat([a, b.chunk]), Buffer.alloc(0))
    // CONSOLE.log('complete', complete)
    return complete
  }
  return null
}

const updatePic = async function (aerospikeConfig, kvDbClient, id, originalPicPath, basePath, sizes = [['mini', 100, 100]]) {
  var sharp = require('sharp')

  // FULL SIZE
  var baseImg = sharp(originalPicPath).resize(1000, 1000).max()
  var picNewPathFullSize = basePath + id + '_full'
  await new Promise((resolve, reject) => baseImg.toFile(picNewPathFullSize, (err, data) => err ? reject(err) : resolve(data)))
  var fullSize = await saveFileInDb(aerospikeConfig, kvDbClient, picNewPathFullSize, id + '_full')
  // SIZES
  for (var i = sizes.length; i--;) {
    var size = sizes[i]
    var picNewPath = basePath + id + '_' + size[0]
    await new Promise((resolve, reject) => baseImg.resize(size[1], size[2]).crop().toFile(picNewPath, (err, data) => err ? reject(err) : resolve(data)))
    var newPic = await saveFileInDb(aerospikeConfig, kvDbClient, picNewPath, id + '_' + size[0])
    unlinkFile(picNewPath)
  }

  // CONSOLE.hl('complete', complete)
  // CLEAR TEMP FILES
  unlinkFile(originalPicPath)
  unlinkFile(picNewPathFullSize)

  return {success: `Pic updated`, id}
}

const resizeAndGetBuffers = async function (originalPicBuffer, sizes = [['mini', 100, 100]]) {
  var sharp = require('sharp')
  var restunObj = {}

  // FULL SIZE
  var baseImg = sharp(originalPicBuffer).resize(2000, 2000).max()
  restunObj.full = await baseImg.toBuffer()
  // SIZES
  for (var i = sizes.length; i--;) {
    var size = sizes[i]
    restunObj[size[0]] = await baseImg.resize(size[1], size[2]).crop().toBuffer()
  }
  // unlinkFile(originalPicPath)
  return restunObj
}
const getPic = async function (aerospikeConfig, kvDbClient, id, size = 'mini') {
  try {
    return await readFileInDb(aerospikeConfig, kvDbClient, id + '_' + size)
  } catch (error) {
    return null
  }
}

module.exports = {
  getPic, updatePic, resizeAndGetBuffers
}
