const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'COUCHBASE', msg, data])) }
const debug = (msg, data) => { if (process.env.debugCouchbase) console.log('\n' + JSON.stringify(['DEBUG', 'COUCHBASE', msg, data])) }
const error = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'COUCHBASE', msg, data])) }

const objMap = (obj, func) => Object.keys(obj).reduce((newObj, key) => { newObj[key] = func(obj[key], key); return newObj }, {})
const toArray = (obj) => {
  if (obj instanceof Array) return obj
  return Object.keys(obj).map((key) => obj[key])
}
const toObj = (array, index = 'id') => array.reduce((newObj, item) => { newObj[item[index]] = item; return newObj }, {})

var couchbase = require('couchbase')

var cluster
var clusterManager
var checkedBucket = {}
var cacheBucket = {}
var createBucket = (bucketName) => new Promise((resolve, reject) => {
  clusterManager.createBucket(bucketName, { ramQuotaMB: 100 }, async function (err) {
    debug('createBucket', {bucketName, err})
    if (err) return reject(err)
    checkedBucket[bucketName] = true
    return resolve(true)
  })
})
var openBucket = (bucketName) => new Promise(async (resolve, reject) => {
  await createBucketIfNotExists(bucketName)
  if (cacheBucket[bucketName]) return resolve(cacheBucket[bucketName])
  var bucket = cluster.openBucket(bucketName, '', function (err) {
    debug('openBucket', {bucketName, err})
    if (err) return reject(err)
    cacheBucket[bucketName] = bucket
    resolve(bucket)
  })
})
var upsert = (bucket, id, doc) => new Promise((resolve, reject) => {
  bucket.upsert(id, doc, function (err, result) {
    debug('upsert', {id, doc, err, result})
    if (err) return reject(err)
    result.id = id
    resolve(result)
  })
})

var get = (bucket, id) => new Promise((resolve, reject) => {
  bucket.get(id, function (err, result) {
    debug('get', {id, err, result})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var remove = (bucket, id) => new Promise((resolve, reject) => {
  bucket.remove(id, function (err, result) {
    debug('remove', {id, err, result})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var getMulti = (bucket, ids) => new Promise((resolve, reject) => {
  bucket.getMulti(ids, function (err, result) {
    debug('getMulti', result)
    return resolve(result)
  })
})
var createIndex = (bucket, fields) => new Promise((resolve, reject) => {
  bucket.manager().createIndex(bucket._name + '_' + fields.map((value) => value.replace('.', '_')).join('_'), fields, {ignoreIfExists: true}, function (err, result) {
    debug('createIndex', {bucketName: bucket._name, fields})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var query = (bucket, statement, argsArray = [], waitIndexUpdate = false, adhoc = false) => new Promise((resolve, reject) => {
  var explodedStatement = statement
  argsArray.forEach((arg, index) => { explodedStatement = explodedStatement.replace('$' + (index + 1), JSON.stringify(arg)) })
  var couchQuery = couchbase.N1qlQuery.fromString(statement).adhoc(adhoc).readonly(true).consistency(waitIndexUpdate ? couchbase.N1qlQuery.Consistency.REQUEST_PLUS : couchbase.N1qlQuery.Consistency.NOT_BOUNDED)
  bucket.query(couchQuery, argsArray, function (error, result) {
    debug('query', {explodedStatement, statement, argsArray, error, result})
    debug(explodedStatement)
    if (error) return reject(error)
    resolve(result)
  })
})
var tryFunction = async function (func, times = 10) {
  debug('tryFunction ', func)
  for (var countTry = 0; countTry < times; countTry++) {
    debug('tryFunction  try// ', countTry)
    try {
      var result = await func()
      return result
    } catch (error) {
      debug('tryFunction error', {func, countTry, error})
      if (error.code !== 13) await new Promise((resolve) => setTimeout(resolve, 5000))
      else return null// throw new Error(error.message)
    }
  }
}
var createBucketIfNotExists = (bucketName) => new Promise((resolve, reject) => {
  debug('createBucketIfNotExists', bucketName, checkedBucket[bucketName])
  if (checkedBucket[bucketName]) return resolve(true)
  listBuckets(bucketName).then(async(bucketsList) => {
    if (bucketsList.indexOf(bucketName) === -1) {
      debug('bucket not exists', {bucketName})
      await tryFunction(() => createBucket(bucketName))
      resolve(true)
    } else resolve(true)
    checkedBucket[bucketName] = true
  }, reject)
})
var listBuckets = (namesOnly = true) => new Promise((resolve, reject) => {
  debug('listBuckets')
  clusterManager.listBuckets(function (err, result) {
    debug('listBuckets', { err, result: result })
    if (err) return reject(err)
    if (!result) return []
    return resolve(namesOnly ? result.map((bucket) => bucket.name) : result)
  })
})

module.exports = {
  async init (url, username, password) {
    cluster = new couchbase.Cluster(url)
    cluster.authenticate(username, password)
    clusterManager = cluster.manager(username, password)
    debug('init', {url, username, password})
  },
  async put (bucketName, doc, id) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await tryFunction(() => upsert(bucket, id || doc.id, doc))
    return result
  },
  async remove (bucketName, id) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await tryFunction(() => remove(bucket, id))
    return result
  },
  async get (bucketName, id, dataOnly = true) {
    try {
      var bucket = await tryFunction(() => openBucket(bucketName))
      var result = await get(bucket, id)
      if (dataOnly && result.value) return result.value
      return result
    } catch (error) { debug('error get:' + error); return null }
  },
  async getMulti (bucketName, ids, dataOnly = true) {
    debug('getMulti', {bucketName, ids, dataOnly})

    var bucket = await tryFunction(() => openBucket(bucketName))
    var rawResults = await getMulti(bucket, ids)
    // result = objMap(result, (singleResult) => {
    //   if (singleResult.error) { debug('error getMulti:' + singleResult.error); return null } else if (dataOnly && singleResult.value) return singleResult.value
    // })
    var results = Object.keys(rawResults).reduce((finalResults, key) => {
      var singleResult = rawResults[key]
      if (singleResult.error) { debug('error getMulti:' + singleResult.error); finalResults.push(null) } else if (dataOnly) { finalResults.push(singleResult.value || null) } else { finalResults.push(singleResult) }
      return finalResults
    }, [])
    debug('getMulti:', results)
    return results
  },
  async upsertMulti (bucketName, items) {
    try {
      debug('upsertMulti upsertMulti:', {bucketName, items})
      var bucket = await tryFunction(() => openBucket(bucketName))
      var results = await Promise.all(items.map((item, index) => upsert(bucket, item.id, item)))
      results = results.map(result => result.error ? result : {success: true, id: result.id})
      return results
    } catch (error) { debug('error upsertMulti:' + error, items); return null }
  },
  async query (bucketName, statement, argsArray) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await query(bucket, statement, argsArray)
    return result
  },
  async createIndex (bucketName, fields) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await tryFunction(() => createIndex(bucket, fields))
    return result
  },
  openBucket,
  createBucketIfNotExists,
  listBuckets
}

//
// var bucket = cluster.openBucket("hello");
// var bucketMgr = bucket.manager();
//
// var ddocdata = {
//   views: {
//     by_name: {
//       map: [ 'function(doc, meta) {',
//              '  if (doc.type && doc.type == "beer") {',
//              '    emit(doc.name, null);',
//              '  }',
//              '}'
//        ].join('\n')
//      },
//   }
// };
//
// bucketMgr.upsertDesignDocument('ddocname', ddocdata, function(err) {
//   debug('Insertion of design document completed with error:', err);
// });
