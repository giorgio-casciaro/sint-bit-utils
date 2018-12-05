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
function getMultiple (kvDbClient, ns, set, ids, resultOnly = true) {
  return new Promise((resolve, reject) => {
    let readKeys = ids.map(id => new Aerospike.Key(ns, set, id))
    kvDbClient.batchGet(readKeys, function (error, results) {
      if (error) {
        console.log('ERROR - %s', error.message)
        reject(error)
        return null
      }
      resolve(results.map((result) => {
        switch (result.status) {
          case Aerospike.status.AEROSPIKE_OK:
            return result.record
          case Aerospike.status.AEROSPIKE_ERR_RECORD_NOT_FOUND:
            console.log('NOT_FOUND - ', result.record.key)
            return null
          default:
            console.log('ERROR - %d - %s', result.status, result.record.key)
            return null
        }
      })
      )
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
    await operate(kvDbClient, key, [op.incr('count', 1), op.write('updated', timestamp), lists.insert('items', 0, item)])
    index.items.unshift(item)
    sortIndex()
  }
  var getItem = async function (itemIndex) {
    await load()
    console.log('OrderedIndex getItem', itemIndex, index.items[itemIndex])
    return index.items[itemIndex]
  }
  var getItems = async function (from, to) {
    await load()
    console.log('OrderedIndex getItems', from, to, index.items.slice(from, to))
    return index.items.slice(from, to)
  }
  return {
    add,
    getMeta,
    getItem,
    getItems
  }
}

function FilteredOrderedIndex (kvDbClient, {ns, set, indexName, itemsSet, filterFunction, filterName, expand = true}) {
  var orderedIndex = OrderedIndex(kvDbClient, {ns, set, indexName})
  var orderedIndexMeta
  var filteredIndex
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
    var start = new Date().getTime()
    await load()
    var cacheUpdated = false
    var filterUpdated = false
    var lastOrderedItem = 0
    while (to > filteredIndex.items.length) {
      var itemsToProcess = []
      var itemsToExpand = []
      var orderedItem, orderedItemUpdated, orderedItemId, itemPosition, filteredItemPosition, filterResult, itemToProcess
      var expandedItemsById = {}
      var orderedItems = await orderedIndex.getItems(lastOrderedItem, to - lastOrderedItem)
      if (!orderedItems.length) break
      for (var i in orderedItems) {
        orderedItem = orderedItems[i]
        orderedItemUpdated = orderedItem[2]
        orderedItemId = orderedItem[0]
        filteredItemPosition = filteredIndex.items.length
        if (cache.items[orderedItemId] && cache.items[orderedItemId][1] === orderedItemUpdated) {
          filterUpdated = true
          filteredIndex.items.push([orderedItemId, orderedItemUpdated])
          if (expand && filteredItemPosition >= from)itemsToExpand.push(orderedItemId)
        } else {
          if (expand)itemsToExpand.push(orderedItemId)
          itemsToProcess.push([orderedItem, filteredItemPosition])
        }
      }
      // console.log('FilteredOrderedIndex getItems check', {orderedItems})

      if (itemsToExpand.length) {
        var expandedItemsArray = await getMultiple(kvDbClient, ns, itemsSet, itemsToExpand)
        expandedItemsArray.forEach(item => { expandedItemsById[item.id] = item })
      }
      // console.log('FilteredOrderedIndex getItems itemsToProcess', itemsToProcess)
      var addedProcessedFields = 0
      for (var p in itemsToProcess) {
        orderedItem = itemsToProcess[p][0]
        orderedItemUpdated = orderedItem[2]
        orderedItemId = orderedItem[0]
        itemPosition = itemsToProcess[p][1]
        itemToProcess = orderedItem
        if (expand)itemToProcess = expandedItemsById[orderedItemId]
        filterResult = filterFunction(itemToProcess)
        cache.items[orderedItemId] = [filterResult, orderedItemUpdated]
        cacheUpdated = true
        if (filterResult) {
          filterUpdated = true
          // console.log('FilteredOrderedIndex getItems check', {orderedItem, itemPosition, filteredIndex: filteredIndex.items})
          filteredIndex.items.splice(itemPosition + addedProcessedFields, 0, [orderedItemId, orderedItemUpdated])
          addedProcessedFields++
        }
      }
      // console.log('FilteredOrderedIndex getItems check', {filteredIndex: filteredIndex.items})

      lastOrderedItem = to - lastOrderedItem
      cicles++
    }
    if (cacheUpdated) await put(kvDbClient, new Key(ns, set, 'filter_byid_' + indexName + '_' + filterName), cache)
    if (filterUpdated) await put(kvDbClient, new Key(ns, set, 'filter_' + indexName + '_' + filterName), filteredIndex)
    // console.log('FilteredOrderedIndex getItems items', filteredIndex.items)
    var results = []
    var rawResults = filteredIndex.items.slice(from, to)
    if (!expand) return rawResults
    for (i in rawResults) {
      var rawResult = rawResults[i]
      var rawResultId = rawResult[0]
      results.push(expandedItemsById[rawResultId])
    }
    console.log('KV FilteredOrderedIndex getItems Execution time: ' + (new Date().getTime() - start))
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
  getMultiple,
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
