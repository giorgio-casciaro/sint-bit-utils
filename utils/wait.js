module.exports = {
  aerospike: async (config) => {
    const Aerospike = require('aerospike')
    var tryConnection = () => new Promise((resolve, reject) => {
      console.log('WAIT aerospike start')
      try {
        Aerospike.connect(config, (error, client) => {
          if (error) resolve(false)
          console.log('WAIT aerospike connected')
          client.info('status', function (err, response, host) {
            console.log('WAIT aerospike status', err, response, host)
            if (err || response !== 'status	ok\n') resolve(false)
            console.log('WAIT aerospike finished OK')
            resolve(true)
          })
        })
      } catch (error) {
        resolve(false)
      }
    })
    var tryResponse = false
    while (!tryResponse) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      tryResponse = await tryConnection()
    }
    console.log('WAIT aerospike FINISHED')
    return true
  },
  service: async (serviceUrl) => {
    const rp = require('request-promise-native')
    var tryConnection = () => new Promise((resolve, reject) => {
      rp(serviceUrl)
      .then(function (htmlString) {
        console.log('WAIT service OK ' + serviceUrl)
        resolve(true)
      })
      .catch(function (err) {
        console.log('WAIT service ERROR ' + serviceUrl)
        resolve(false)
      })
    })
    var tryResponse = false
    while (!tryResponse) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      tryResponse = await tryConnection()
    }
    console.log('WAIT service FINISHED ' + serviceUrl)
    return true
  }
}
