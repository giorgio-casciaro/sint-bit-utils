// VERSION 0.0.1
var path = require('path')
const Aerospike = require('aerospike')
const Key = Aerospike.Key
var checkKey = (key, kvDbClient) => {
  if (typeof key === 'string') return new Key(kvDbClient.extraConfig.namespace, kvDbClient.extraConfig.set, key)
  return key
}

function put (kvDbClient, key, data, meta, policy = { exists: Aerospike.policy.exists.CREATE_OR_REPLACE }) {
  return new Promise((resolve, reject) => {
    kvDbClient.put(checkKey(key, kvDbClient), data, meta, policy, (error, result) => {
      if (error) return reject(error)
      resolve(result)
    })
  })
}
function get (kvDbClient, key, resultOnly = true) {
  return new Promise((resolve, reject) => {
    kvDbClient.get(checkKey(key, kvDbClient), (error, result, meta) => {
      // if (error) return reject(error)
      if (error) return resolve(null)
      if (resultOnly) return resolve(result)
      resolve({result, meta})
    })
  })
}
function operate (kvDbClient, key, ops, resultOnly = true) {
  return new Promise((resolve, reject) => {
    kvDbClient.operate(checkKey(key, kvDbClient), ops, (error, result, meta) => {
      // if (error) return reject(error)
      if (error) return resolve(null)
      if (resultOnly) return resolve(result)
      resolve({result, meta})
    })
  })
}
function udfRegister (kvDbClient, {udf}) {
  return new Promise((resolve, reject) => {
    kvDbClient.udfRegister(udf, (error) => {
      if (error) return reject(error)
      resolve(true)
    })
  })
}
function query (kvDbClient, namespace, set, modify = (query) => query) {
  return new Promise((resolve, reject) => {
    var query = kvDbClient.query(namespace, set)
    modify(query)
    var stream = query.foreach()
    var results = []
    stream.on('error', (error) => {
      console.error(error)
      // throw error
      reject(error)
    })
    stream.on('data', (record) => {
      results.push(record)
    })
    stream.on('end', () => {
      resolve(results)
    })
  })
}
function OrderedIndex (kvDbClient, {ns, set, indexName, sortFunction}) {
  var op = Aerospike.operator
  const lists = Aerospike.lists
  var key = new Key(ns, set, 'index_' + indexName)
  var loaded = false
  var defaultProp = {
    count: 0,
    updated: Date.now(),
    items: []
  }
  var index = defaultProp
  var sortIndex = async function () {
    if (sortFunction) {
      await load()
      index.items = sortFunction(index.items)
      await save()
    }
  }
  var load = async function () {
    if (loaded) return false
    index = await get(kvDbClient, key)
    if (!index)index = defaultProp
    console.log('OrderedIndex loaded', index)
    loaded = true
  }
  var getMeta = async function () {
    await load()
    return {
      count: index.count,
      updated: index.updated
    }
  }
  var save = async function () {
    await put(kvDbClient, key, index)
  }
  var add = async function (itemId, value) {
    var timestamp = Date.now()
    var item = [itemId, value, timestamp]
    await operate(kvDbClient, key, [op.incr('count', 1), op.write('updated', timestamp), lists.append('items', item)])
    index.items.unshift(item)
    sortIndex()
  }
  var getItem = async function (itemIndex) {
    await load()
    console.log('OrderedIndex getItem', itemIndex, index.items[itemIndex])
    return index.items[itemIndex]
  }
  return {
    add,
    getMeta,
    getItem
  }
}

function FilteredOrderedIndex (kvDbClient, {ns, set, indexName, itemsSet, filterFunction, filterName, expand = true}) {
  var orderedIndex = OrderedIndex(kvDbClient, {ns, set, indexName})
  var orderedIndexMeta
  var filteredIndex
  var expandedItems = {}
  var cicles = 0
  var loaded = false
  var cache

  var load = async function () {
    if (loaded) return false
    orderedIndexMeta = await orderedIndex.getMeta()
    filteredIndex = await get(kvDbClient, new Key(ns, set, 'filter_' + indexName + '_' + filterName))
    if (!filteredIndex)filteredIndex = {items: []}
    if (filteredIndex.updated !== orderedIndexMeta.updated) filteredIndex.items = []
    cache = await get(kvDbClient, new Key(ns, set, 'filter_byid_' + indexName + '_' + filterName))
    if (!cache)cache = {items: {}}
    loaded = true
  }
  var getItems = async function (from, to) {
    console.log('FilteredOrderedIndex getItems from, to', from, to)
    await load()
    var cacheUpdated = false
    var filterUpdated = false
    while (to > filteredIndex.items.length) {
      var orderedItem = await orderedIndex.getItem(cicles)
      if (!orderedItem) break
      var orderedItemUpdated = orderedItem[2]
      var orderedItemId = orderedItem[0]
      var processItem = orderedItem
      console.log('processItem', processItem, itemsSet, orderedItem)
      var filterResult
      if (cache.items[orderedItemId] && cache.items[orderedItemId][1] === orderedItemUpdated) {
        filterResult = cache.items[orderedItemId][0]
        console.log('filterResult cache', filterResult)
      } else {
        console.log('processItem', processItem, itemsSet, orderedItem)
        if (expand)processItem = expandedItems[orderedItemId] = await get(kvDbClient, new Key(ns, itemsSet, orderedItemId))
        filterResult = filterFunction(processItem)
        cache.items[orderedItemId] = [filterResult, orderedItemUpdated]
        cacheUpdated = true
      }
      if (filterResult) {
        filterUpdated = true
        filteredIndex.items.push([orderedItemId, orderedItemUpdated])
      }
      cicles++
    }
    if (cacheUpdated) await set(kvDbClient, new Key(ns, set, 'filter_byid_' + indexName + '_' + filterName), cache)
    if (filterUpdated) await set(kvDbClient, new Key(ns, set, 'filter_' + indexName + '_' + filterName), filteredIndex)
    console.log('FilteredOrderedIndex getItems items', filteredIndex.items)
    var results = []
    var rawResults = filteredIndex.items.slice(from, to)
    if (!expand) return rawResults
    for (var i in rawResults) {
      var rawResult = rawResults[i]
      var rawResultId = rawResult[0]
      if (expandedItems[rawResultId])results.push(expandedItems[rawResultId])
      else { results.push(await get(kvDbClient, new Key(ns, itemsSet, rawResultId))) }
    }
    return results
  }
  return {
    getItems
  }
}

// async function addToOrderedIndex (kvDbClient, {orderedIndexMeta = false, ns, set, indexName, itemId, value, sortFunction}) {
//   var op = Aerospike.operator
//   var updateTime = Date.now()
//   var key = new Key(ns, set, 'index_' + indexName)
//   await operate(kvDbClient, key, [op.incr('count', 1), op.prepend('items', [itemId, value, updateTime])])
//   if (sortFunction) {
//     var index = await get(kvDbClient, key)
//     var orderedIndex = sortFunction(index.items)
//     await put(kvDbClient, key, orderedIndex)
//   }
// }
// async function getOrderedIndexMeta (kvDbClient, {orderedIndexMeta = false, ns, set, indexName}) {
//   var key = new Key(ns, set, 'index_' + indexName)
//   var index = await get(kvDbClient, key)
//   return index || {count: 0, items: []}
// }
// async function getOrderedIndexItem (kvDbClient, {orderedIndexMeta = false, ns, set, indexName, itemIndex}) {
//   var key = new Key(ns, set, 'index_' + indexName)
//   var index = await get(kvDbClient, key)
//   var results = index
//   return results
// }
// async function filterOrderedIndex (kvDbClient, {orderedIndexMeta = false, ns, set, indexName, from = false, to = false, filterFunction, filterName}) {
//   var orderedIndexMeta = await getOrderedIndexMeta(kvDbClient, {ns, set, indexName})
//   var filteredIndex = []
//   var filteredCount = 0
//   var loop = true
//   while (loop) {
//     var item = getOrderedIndexItem(kvDbClient, {ns, set, indexName})
//     if (!item) { loop = false; break }
//     if (filterFunction(item)) {
//       if (from === false || filteredCount >= from)filteredIndex.push(item)
//       filteredCount++
//       if (to !== false || filteredCount >= to) { loop = false; break }
//     }
//   }
//   // var key = new Key(ns, set, 'index_' + filterName)
//   // var filteredIndexCache = await get(kvDbClient, key)
//
//   // get filteredOrderedIndex from cache
//   // se non è presente nella cache o è cambiata la data di aggiornamento il filtro viene riprocessato
//   //
// }
module.exports = {
  OrderedIndex,
  FilteredOrderedIndex,
  put,
  get,
  operate,
  getClient (config) {
    return new Promise((resolve, reject) => {
      // config.modlua = {userPath: path.join(__dirname, '/kvDbLua')}
      Aerospike.connect(config, async(error, client) => {
        if (error) return reject(error)
        client.extraConfig = config
        // await udfRegister(client, { udf: path.join(__dirname, '/kvDbLua/query.lua') })
        resolve(client)
      })
    })
  },

  key (namespace, set, id) {
    return new Key(namespace, set, id)
  },
  remove (kvDbClient, key) {
    return new Promise((resolve, reject) => {
      kvDbClient.remove(checkKey(key, kvDbClient), (error, key) => {
        if (error) return reject(error)
        resolve(key)
      })
    })
  },
  createIndex (kvDbClient, options, skipError = false) {
    return new Promise((resolve, reject) => {
      kvDbClient.createIndex(options, (error, job) => {
        if (skipError && error) return resolve(error)
        if (error) return reject(error)
        job.waitUntilDone(function (error, result) {
          if (skipError && error) return resolve(error)
          if (error) return reject(error)
          resolve(result)
        })
      })
    })
  },
  removeSet (kvDbClient, {ns, set}) {
    return new Promise((resolve, reject) => {
      kvDbClient.truncate(ns, set, (error) => {
        if (error) return reject(error)
        resolve(true)
      })
    })
  },

  udfRegister,
  queryAdv (kvDbClient, namespace, set, options) {
    return new Promise((resolve, reject) => {
      var query = kvDbClient.query(namespace, set)
      if (options.select)query.select(options.select)
      if (options.primaryIndex)query.where(Aerospike.filter.equal(options.primaryIndex, options.primaryIndexValue))
      query.setUdf('query', 'queryAdv', options)

      // STREAM
      var stream = query.foreach()
      var results = []
      stream.on('error', (error) => {
        console.error(error)
        // throw error
        reject(error)
      })
      stream.on('data', (record) => {
        results.push(record)
      })
      stream.on('end', () => {
        resolve(results)
      })
    })
  },
  query
}
