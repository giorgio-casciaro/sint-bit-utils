module.exports = {
  aerospike: async (config) => {
    const Aerospike = require('aerospike')
    var tryConnection = () => new Promise((resolve, reject) => {
      console.log('WAIT aerospike start ')
      try {
        Aerospike.connect(config, (error, client) => {
          if (error) resolve(false)
          console.log('WAIT aerospike connected ')
          client.info('status', function (err, response, host) {
            console.log('WAIT aerospike status ', err, response, host)
            if (err || response !== 'status	ok\n') resolve(false)
            console.log('WAIT aerospike finished OK ')
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
    console.log('WAIT aerospike FINISHED ')
    return true
  },
  service: async (serviceUrl, warmupTimeIfNotReady = 10000, warmupTime = 2000) => {
    const rp = require('request-promise-native')
    var tryConnection = () => new Promise((resolve, reject) => {
      rp(serviceUrl).then(function (responseString) {
        console.log('WAIT service OK ' + serviceUrl)
        resolve(true)
      }).catch(function (err) {
        warmupTime = warmupTimeIfNotReady
        // console.log(err)
        console.log('WAIT service ERROR ' + serviceUrl)
        return resolve(false)
      })
    })
    var tryResponse = false
    while (!tryResponse) {
      console.log('WAIT serviceResponse TRY ' + serviceUrl)
      tryResponse = await tryConnection()
      if (!tryResponse) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    console.log('WAIT service warmupTime ' + warmupTime)
    await new Promise((resolve) => setTimeout(resolve, warmupTime))
    console.log('WAIT service FINISHED ' + serviceUrl)
    return true
  },
  serviceResponse: async (serviceUrl, expectedResponseFields) => {
    const rp = require('request-promise-native')
    var tryResponse = false
    while (!tryResponse) {
      console.log('WAIT serviceResponse TRY' + serviceUrl)
      try {
        var responseString = await rp(serviceUrl)
        var responseObj = JSON.parse(responseString)
        for (var oKey in Object.keys(expectedResponseFields)) {
          if (expectedResponseFields[oKey] !== responseObj[oKey]) throw new Error('expectedResponseFields and responseObj are differents')
        }
        console.log('WAIT serviceResponse OK ' + serviceUrl, responseString)
        tryResponse = true
      } catch (err) {
        console.log('WAIT service ERROR ' + serviceUrl, err.message)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        tryResponse = false
      }
    }
    console.log('WAIT service FINISHED ' + serviceUrl)
    return true
  }
}
