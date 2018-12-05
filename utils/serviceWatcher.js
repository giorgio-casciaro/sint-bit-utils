
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
  log('getServiceMainWatcher not from cache', { serviceName, serviceWatcherWatchers: Object.keys(serviceWatcherWatchers) })
  mainWatcher.setMaxListeners(100000000)
  try {
    mainWatcher.hosts = await getServiceDnsHosts(serviceName, true)
  } catch (err) {
    errorLog('getServiceDnsHosts', err)
    mainWatcher.hosts = []
  }
  mainWatcher.listeners = 0
  mainWatcher.interval = setInterval(async () => {
    try {
      // if (mainWatcher.listerners) {
      var checkHosts = await getServiceDnsHosts(serviceName, true)
      debug('dynamic checkHosts', { serviceName, checkHosts, listernersCount: mainWatcher.listeners })
      if (checkHosts.sort().join(',') !== mainWatcher.hosts.sort().join(',')) {
        var addedHosts = checkHosts.filter(host => mainWatcher.hosts.indexOf(host) < 0)
        var removedHosts = mainWatcher.hosts.filter(host => checkHosts.indexOf(host) < 0)
        log('dynamic hosts', { addedHosts, removedHosts })
        addedHosts.forEach(host => mainWatcher.emit('addedHost', host, serviceName))
        removedHosts.forEach(host => mainWatcher.emit('removedHost', host, serviceName))
          // var addedHostsResponses = await Promise.all(addedHosts.map((host) => zeromqClient.rpcTry(['tcp://' + host + ':81'], methodName, data, meta, asStream)))
          // addedHostsResponses.filter((stream) => !!stream).forEach(addStream)
        mainWatcher.hosts = checkHosts
      }
      // }
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
  }, 60000)
  serviceWatcherWatchers[serviceName] = mainWatcher
  return mainWatcher
}

async function getServiceDnsHosts (service, excludeThisIp = true) {
  return new Promise((resolve, reject) => {
    dns.lookup('tasks.' + service, {all: true}, function (err, addresses, family) {
      log('dns.lookup tasks.' + service, {err, addresses, family, IPADDRESS: process.env.IPADDRESS})
      if (typeof addresses === 'string')addresses = [addresses]
      if (err) return reject(err)
      var ips = []
      for (var i in addresses) {
        if (!excludeThisIp || !process.env.IPADDRESS || process.env.IPADDRESS !== addresses[i].address)ips.push(addresses[i].address)
      }
      return resolve(ips)
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
  getServiceMainWatcher
}
