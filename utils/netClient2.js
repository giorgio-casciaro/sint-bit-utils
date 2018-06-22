
var zeromqClient = require('sint-bit-jesus/clients/zeromq')()

const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'NETCLIENT', msg, data])) }
const debug = (msg, data) => { if (process.env.debugNetClient)console.log('\n' + JSON.stringify(['DEBUG', 'NETCLIENT', msg, data])) }
const errorLog = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'NETCLIENT', msg, data])); console.error(data) }

var servicesRoundRobinCounter = {}
var getServiceDnsHoststimeout = {}
var serviceDnsHosts = {}
var serviceWatcherWatchers = {}
const EventEmitter = require('events')
class ServiceWatcherEmitter extends EventEmitter {}

var getServiceWatcher = async function (serviceName) {
  if (serviceWatcherWatchers[serviceName]) return serviceWatcherWatchers[serviceName]
  var hosts = await getServiceDnsHosts(serviceName, true)
  var watcher = new ServiceWatcherEmitter()
  watcher.interval = setInterval(async () => {
    var checkHosts = await getServiceDnsHosts(serviceName, true)
    debug('dynamic checkHosts', { checkHosts })
    if (checkHosts.sort().join(',') !== hosts.sort().join(',')) {
      var addedHosts = checkHosts.filter(host => hosts.indexOf(host) < 0)
      var removedHosts = hosts.filter(host => checkHosts.indexOf(host) < 0)
      log('dynamic hosts', { addedHosts, removedHosts })
      addedHosts.forEach(host => watcher.emit('addedHost', host))
      removedHosts.forEach(host => watcher.emit('removedHost', host))
      // var addedHostsResponses = await Promise.all(addedHosts.map((host) => zeromqClient.rpcTry(['tcp://' + host + ':81'], methodName, data, meta, asStream)))
      // addedHostsResponses.filter((stream) => !!stream).forEach(addStream)
      hosts = checkHosts
    }
  }, 300)
  serviceWatcherWatchers[serviceName] = watcher
  return watcher
}

async function getServiceDnsHosts (service, forceReload) {
  if (!forceReload && serviceDnsHosts[service]) return serviceDnsHosts[service]
  if (getServiceDnsHoststimeout[service])clearTimeout(getServiceDnsHoststimeout[service])
  getServiceDnsHoststimeout[service] = setTimeout(() => { serviceDnsHosts[service] = false }, 10000)
  var dns = require('dns')
  var adresses
  while (!adresses) {
    try {
      adresses = await new Promise((resolve, reject) => {
        dns.lookup('tasks.' + service, {all: true}, function (err, addresses, family) {
          debug('dns.lookup tasks.' + service, {err, addresses, family})
          if (typeof addresses === 'string')addresses = [addresses]
          if (err) return reject(err)
          return resolve(addresses.map(address => address.address))
        })
      })
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  serviceDnsHosts[service] = adresses
  return serviceDnsHosts[service]
}

async function getServiceHost (service, hosts) {
  if (!hosts)hosts = await getServiceDnsHosts(service)
  // log('getServiceHost hosts' + service, {hosts})
  if (hosts.length === 1) return hosts[0]
  var counter = servicesRoundRobinCounter[service] || 0
  if (counter >= hosts.length)counter = 0
  servicesRoundRobinCounter[service] = counter + 1
  return hosts[counter]
}

var netClientListeners = {}
var netClientListenersByService = {}
// const EventEmitter = require('events')
// class NetClientStreamEmitter extends EventEmitter {}
var captureEmitQueue = true
setTimeout(() => (captureEmitQueue = false), 60000)
var emitQueue = {}
var emit = (eventName, eventData) => {
  debug('netClient emit', {eventName, eventData, netClientListenersByService})
  if (captureEmitQueue) {
    if (!emitQueue[eventName])emitQueue[eventName] = []
    emitQueue[eventName].push(eventData)
    // log('emitQueue', {emitQueue})
  }
  if (netClientListeners[eventName])netClientListeners[eventName].forEach((listener) => listener.eventFunction(eventData))
  if (netClientListenersByService[eventName]) {
    for (var serviceName in netClientListenersByService[eventName]) {
      var service = netClientListenersByService[eventName][serviceName]
      var listenerIndex = service.counter % service.listeners.length
      service.listeners[listenerIndex].eventFunction(eventData, serviceName, netClientListenersByService[eventName])
    }
  }
}
var randomizeArray = function (array) {
  var currentIndex = array.length, temporaryValue, randomIndex

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex -= 1

    // And swap it with the current element.
    temporaryValue = array[currentIndex]
    array[currentIndex] = array[randomIndex]
    array[randomIndex] = temporaryValue
  }

  return array
}
module.exports = {
  testPuppets: {},
  getEmitQueue: (eventName) => {
    if (!captureEmitQueue) return []
    return emitQueue[eventName] || []
  },
  on: (eventName, eventFunction, eventService, emitOldQueueOnFirstListener = false) => {
    debug('netClient on', eventName, eventFunction, eventService)
    // if (emitOldQueueOnFirstListener && !netClientListeners[eventName] && !netClientListenersByService[eventName]) var emitQueueAtEnd = true
    if (eventService) {
      if (!netClientListenersByService[eventName])netClientListenersByService[eventName] = {}
      if (!netClientListenersByService[eventName][eventService])netClientListenersByService[eventName][eventService] = {counter: 0, listeners: []}
      netClientListenersByService[eventName][eventService].listeners.push({eventName, eventFunction, eventService})
    } else {
      if (!netClientListeners[eventName])netClientListeners[eventName] = []
      netClientListeners[eventName].push({eventName, eventFunction, eventService})
    }
    // if (emitQueueAtEnd) {
    //   emitToEmptyQueue.forEach(eventInfo => emit(eventInfo.eventName, eventInfo.eventData))
    //   // emitToEmptyQueue = []
    // }
  },
  emit,
  off: (eventName, eventFunction) => {
    debug('netClient off', eventName, eventFunction)
    if (netClientListeners[eventName])netClientListeners[eventName] = netClientListeners[eventName].filter((listener) => listener.eventFunction !== eventFunction)
    if (netClientListenersByService[eventName]) {
      for (var service in netClientListenersByService[eventName]) { service.listeners = service.listeners.filter((listener) => listener.eventFunction !== eventFunction) }
    }
  },
  rpc: async (serviceName, methodName, data, meta, asStream, toEveryTask = false, dynamic = false, addedStream = false, removedStream = false) => {
    var serviceWatcher = await getServiceWatcher(serviceName)
    var zeromqClientConnectionsValid = []
    while (!zeromqClientConnectionsValid.length) {
      var hosts = await getServiceDnsHosts(serviceName)
      var zeromqClientConnections = await Promise.all(hosts.map((host) => zeromqClient.getConnection('tcp://' + host + ':81')))
      zeromqClientConnectionsValid = zeromqClientConnections.filter((conn) => conn.connected)
      var validPaths = zeromqClientConnectionsValid.map((conn) => conn.path)
      if (!zeromqClientConnectionsValid.length) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!serviceWatcher.onCloseSetted) {
      serviceWatcher.onCloseSetted = true
      serviceWatcher.on('removedHost', (host) => {
        log('removedHost', {host})
        zeromqClient.closeConnection('tcp://' + host + ':81')
      })
    }
    if (!toEveryTask) {
      return zeromqClient.rpcTry(randomizeArray(validPaths), methodName, data, meta, asStream)
    }
    if (dynamic) {
      serviceWatcher.on('addedHost', async (host) => {
        var path = 'tcp://' + host + ':81'
        var response = await zeromqClient.rpcTry([path, path, path, path, path], methodName, data, meta, asStream)
        if (response)addedStream(response)
      })

      // setInterval(async () => {
      //   var checkHosts = await getServiceDnsHosts(serviceName, true)
      //   debug('dynamic checkHosts', { checkHosts })
      //   if (checkHosts.sort().join(',') !== hosts.sort().join(',')) {
      //     var addedHosts = checkHosts.filter(host => hosts.indexOf(host) < 0)
      //     var removedHosts = hosts.filter(host => checkHosts.indexOf(host) < 0)
      //     log('dynamic hosts', { addedHosts, removedHosts })
      //     var addedHostsResponses = await Promise.all(addedHosts.map((host) => zeromqClient.rpcTry(['tcp://' + host + ':81'], methodName, data, meta, asStream)))
      //     addedHostsResponses.filter((stream) => !!stream).forEach(addStream)
      //     hosts = checkHosts
      //   }
      // }, 1000)
    }
    var multiResponse = await Promise.all(validPaths.map((path) => zeromqClient.rpcTry([path, path, path, path, path, path, path, path, path, path, path, path, path], methodName, data, meta, asStream)))
    // if (asStream)multiResponse = multiResponse.filter((stream) => !!stream)
    if (dynamic) multiResponse.filter((stream) => !!stream).forEach(addedStream)
    return multiResponse
  },
  push: async (eventName, data, meta) => {}
}
