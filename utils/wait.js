module.exports = {
  aerospike: async (config) => {
    const Aerospike = require('aerospike')
    var getAerospikeClient = () => new Promise((resolve, reject) => {
      var retry = () => {
        console.log('WAIT aerospike start')
        try {
          Aerospike.connect(config, (error, client) => {
            if (error) return setTimeout(() => getAerospikeClient(), 1000)
            console.log('WAIT aerospike connected')
            client.info('status', function (err, response, host) {
              console.log('WAIT aerospike status', err, response, host)
              if (err || response !== 'status	ok\n') return setTimeout(() => retry(), 1000)
              console.log('WAIT aerospike finished OK')
              resolve(client)
            })
          })
        } catch (error) { setTimeout(() => retry(), 5000) }
      }
      retry()
    })
    return await getAerospikeClient()
  },
  service: async (serviceUrl) => {
    console.log('WAIT service ' + serviceUrl)
    var rp = require('request-promise-native')
    var getUrl = () => new Promise((resolve, reject) => {
      console.log('WAIT service get ' + serviceUrl)
      // rp(serviceUrl).then(() => resolve(true)).catch((error) => console.log("error",error))
      var retry = () => rp(serviceUrl)
        .then(function (htmlString) {
          console.log('WAIT service OK ' + serviceUrl)
          resolve(true)
        })
        .catch(function (err) {
          console.log('WAIT service RETRY ' + serviceUrl)
          // console.log(err)
          setTimeout(() => retry(), 5000)
        })
      retry()
    })
    return await getUrl()
  }
}
