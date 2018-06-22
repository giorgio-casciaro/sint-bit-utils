
const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'SERVICEWATCHER', msg, data])) }
const debug = (msg, data) => { if (process.env.debugNetClient)console.log('\n' + JSON.stringify(['DEBUG', 'SERVICEWATCHER', msg, data])) }
const errorLog = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'SERVICEWATCHER', msg, data])); console.error(data) }

var serviceWatcherWatchers = {}
class ServiceWatcherEmitter extends require('events') {}
var dns = require('dns')

var tryFunction = async function (func, times = 10, time = 1000) {
  for (var countTry = 0; countTry < times; countTry++) {
    try {
      var result = await func()
      return result
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, time))
    }
  }
}

var getServiceMainWatcher = async function (serviceName) {
  if (serviceWatcherWatchers[serviceName]) return serviceWatcherWatchers[serviceName]
  var mainWatcher = new ServiceWatcherEmitter()
  log('getServiceMainWatcher not from cache', { serviceName })
  mainWatcher.setMaxListeners(100000000)
  try {
    mainWatcher.hosts = await getServiceDnsHosts(serviceName, true)
  } catch (err) {
    mainWatcher.hosts = []
  }
  mainWatcher.interval = setInterval(async () => {
    try {
      var listernersCount = mainWatcher.listenerCount('removedHost') + mainWatcher.listenerCount('addedHost')
      if (listernersCount) {
        var checkHosts = await getServiceDnsHosts(serviceName, true)
        debug('dynamic checkHosts', { serviceName, checkHosts, listernersCount })
        if (checkHosts.sort().join(',') !== mainWatcher.hosts.sort().join(',')) {
          var addedHosts = checkHosts.filter(host => mainWatcher.hosts.indexOf(host) < 0)
          var removedHosts = mainWatcher.hosts.filter(host => checkHosts.indexOf(host) < 0)
          log('dynamic hosts', { addedHosts, removedHosts })
          addedHosts.forEach(host => mainWatcher.emit('addedHost', host))
          removedHosts.forEach(host => mainWatcher.emit('removedHost', host))
          // var addedHostsResponses = await Promise.all(addedHosts.map((host) => zeromqClient.rpcTry(['tcp://' + host + ':81'], methodName, data, meta, asStream)))
          // addedHostsResponses.filter((stream) => !!stream).forEach(addStream)
          mainWatcher.hosts = checkHosts
        }
      }
      // await new Promise((resolve) => setTimeout(resolve, 1000))
      // var listernersCount = mainWatcher.listenerCount('removedHost') + mainWatcher.listenerCount('addedHost')
      // log('mainWatcher.listenerCount()', { serviceName, listernersCount })
      // if (!listernersCount) {
      //   log('!listernersCount', { serviceName, listernersCount })
      //   clearInterval(mainWatcher.interval)
      //   delete serviceWatcherWatchers[serviceName]
      //   return false
      // }
    } catch (err) {
      errorLog('getServiceWatcher interval', err)
    }
  }, 300)
  serviceWatcherWatchers[serviceName] = mainWatcher
  return mainWatcher
}

async function getServiceDnsHosts (service) {
  return new Promise((resolve, reject) => {
    dns.lookup('tasks.' + service, {all: true}, function (err, addresses, family) {
      debug('dns.lookup tasks.' + service, {err, addresses, family})
      if (typeof addresses === 'string')addresses = [addresses]
      if (err) return reject(err)
      return resolve(addresses.map(address => address.address))
    })
  })
}

// async function getServiceHost (service, hosts) {
//   if (!hosts)hosts = await getServiceDnsHosts(service)
//   // log('getServiceHost hosts' + service, {hosts})
//   if (hosts.length === 1) return hosts[0]
//   var counter = servicesRoundRobinCounter[service] || 0
//   if (counter >= hosts.length)counter = 0
//   servicesRoundRobinCounter[service] = counter + 1
//   return hosts[counter]
// }

module.exports = {
  async getServiceWatcher (service, {getConnection, checkConnection, closeConnection, addedHost, removedHost}) {
    var mainWatcher = await getServiceMainWatcher(service)
    var connections = {}
    var connectionsPromises = {}
    var internalAddedHost = async (host, service) => {
      connectionsPromises[host] = getConnection(host, service)
      var conn = connections[host] = await connectionsPromises[host]
      if (addedHost) await addedHost(host, service, conn)
    }
    var internalRemovedHost = async (host, service) => {
      var conn = connections[host]
      // if (!conn.connected)log('internalRemovedHost', {host, service})
      if (removedHost) await removedHost(host, service, conn)
      // if (closeConnection) await closeConnection(host, service, conn)
      if (connectionsPromises[host].reject)connectionsPromises[host].reject()
      delete connectionsPromises[host]
      delete connections[host]
    }
    mainWatcher.on('addedHost', internalAddedHost)
    mainWatcher.on('removedHost', internalRemovedHost)
    mainWatcher.hosts.forEach((host) => internalAddedHost(host, service))
    return {
      getHosts () {
        return mainWatcher.hosts
      },
      waitFirstConnection: async () => {
        // await Promise.race(Object.values(connectionsPromises))
        while (Object.values(connections).filter(checkConnection).length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },
      waitConnection: async (connection) => {
        while (!checkConnection(connection)) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },
      waitAllConnections: async () => {
        log('waitAllConnections', {connLength: Object.values(connectionsPromises).length})
        // await Promise.all(Object.values(connectionsPromises))
        while (Object.values(connections).filter(checkConnection).length !== Object.values(connections).length) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },
      getConnectedConnections: () => Object.values(connections).filter(checkConnection),
      destroy () {
        mainWatcher.hosts.forEach((host) => internalRemovedHost(host, service))
        mainWatcher.off('addedHost', internalAddedHost)
        mainWatcher.off('removedHost', internalRemovedHost)
      }
    }
  }
}
