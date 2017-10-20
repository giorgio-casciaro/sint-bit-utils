// VERSION 0.0.1
const Aerospike = require('aerospike')
const Key = Aerospike.Key
var checkKey = (key, kvDbClient) => {
  if (typeof key === 'string') return new Key(kvDbClient.extraConfig.namespace, kvDbClient.extraConfig.set, key)
  return key
}
module.exports = {
  getClient (config) {
    return new Promise((resolve, reject) => {
      Aerospike.connect(config, (error, client) => {
        if (error) return reject(error)
        client.extraConfig = config
        resolve(client)
      })
    })
  },
  key (namespace, set, id) {
    return new Key(namespace, set, id)
  },
  put (kvDbClient, key, data, meta, policy = { exists: Aerospike.policy.exists.CREATE_OR_REPLACE }) {
    return new Promise((resolve, reject) => {
      kvDbClient.put(checkKey(key, kvDbClient), data, meta, policy, (error, result) => {
        if (error) return reject(error)
        resolve(result)
      })
    })
  },
  get (kvDbClient, key, resultOnly = true) {
    return new Promise((resolve, reject) => {
      kvDbClient.get(checkKey(key, kvDbClient), (error, result, meta) => {
        // if (error) return reject(error)
        if (error) return resolve(null)
        if (resultOnly) return resolve(result)
        resolve({result, meta})
      })
    })
  },
  operate (kvDbClient, key, ops, resultOnly = true) {
    return new Promise((resolve, reject) => {
      kvDbClient.operate(checkKey(key, kvDbClient), ops, (error, result, meta) => {
        // if (error) return reject(error)
        if (error) return resolve(null)
        if (resultOnly) return resolve(result)
        resolve({result, meta})
      })
    })
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
  query (kvDbClient, namespace, set, modify = (query) => query) {
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
}
