
var zeromqClient = require('sint-bit-jesus/clients/zeromq')()
var serviceWatcher = require('./serviceWatcher')

const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'NETCLIENT', msg, data])) }
const debug = (msg, data) => { if (process.env.debugNetClient)console.log('\n' + JSON.stringify(['DEBUG', 'NETCLIENT', msg, data])) }
const errorLog = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'NETCLIENT', msg, data])); console.error(data) }

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
  rpc: async (serviceName, methodName, data, meta, asStream, toEveryTask = false, addedStream = false, removedStream = false) => {
    var hostToPath = (host) => 'tcp://' + host + ':81'
    var streams = []
    var watcher = await serviceWatcher.getServiceWatcher(serviceName, {
      getConnection: async (host, service) => {
        var conn = await zeromqClient.getConnection(hostToPath(host))
        if (toEveryTask && asStream) { await conn.checkConnection() }
        return conn
      },
      closeConnection: async (host, service, conn) => zeromqClient.closeConnection(hostToPath(host)),
      checkConnection: (conn) => conn.connected,
      addedHost: async function (host, service, conn) {
        if (toEveryTask && asStream) {
          log('addedHost', {host, service, methodName, data, meta, asStream})
          var stream = await conn.rpc(methodName, data, meta, asStream)
          if (stream) {
            streams.push(stream)
            if (addedStream)addedStream(stream)
          } else log('addedHost get stream error', {host, service, methodName, data})
        }
      },
      removedHost: async (host, service, conn) => {
        // if (toEveryTask && asStream ) {
        //   watcher.streams.forEach((stream))
        //   var stream = await this.connections[host].rpc(methodName, data, meta, asStream)
        //   if (stream) this.streams.push(stream) && addedStream(stream)
        //   else log('addedHost get stream error', {host, service, methodName, data})
        // }
      },
      rpc: async (host, service, conn) => {
        conn.rpc(methodName, data, meta, asStream)
      }
    })
    // var zeromqClientConnectionsValid = []
    // while (!zeromqClientConnectionsValid.length) {
    //   var zeromqClientConnections = await Promise.all(watcher.getHosts().map((host) => zeromqClient.getConnection('tcp://' + host + ':81')))
    //   zeromqClientConnectionsValid = zeromqClientConnections.filter((conn) => conn.connected)
    //   var validPaths = zeromqClientConnectionsValid.map((conn) => conn.path)
    //   if (!zeromqClientConnectionsValid.length) await new Promise((resolve) => setTimeout(resolve, 100))
    // }
    // log('validPaths', {serviceName, validPaths})
    try {
      if (toEveryTask) {
        await watcher.waitAllConnections()
        if (asStream) {
          streams = await Promise.all(watcher.getConnectedConnections().map((conn) => conn.rpc(methodName, data, meta, asStream)))
          // streams = await Promise.all(validPaths.map((path) => zeromqClient.rpcTry([path, path, path, path, path, path, path, path, path, path, path, path, path], methodName, data, meta, asStream)))
          // streams = await Promise.all(validPaths.map((path) => zeromqClient.rpcTry([path, path, path, path, path, path, path, path, path, path, path, path, path], methodName, data, meta, asStream)))
          streams = streams.filter((stream) => !!stream)
          streams.forEach(addedStream)
          var streamsManager = {
            streams,
            destroy: () => {
              streamsManager.streams.forEach(stream => { if (stream)stream.destroy() })
              delete streamsManager.streams
              watcher.destroy()
            }
          }
          return streamsManager
        } else {
          var responses = await Promise.all(watcher.getConnectedConnections().map((conn) => conn.rpc(methodName, data, meta, asStream)))
          watcher.destroy()
          return responses
        }
      } else {
        await watcher.waitFirstConnection()
        var conns = watcher.getConnectedConnections()
        var conn = conns[Math.floor(Math.random() * conns.length)]
        if (!conn || !conn.connected) throw new Error('rpc no connection avaiable')
        var response = await conn.rpc(methodName, data, meta, asStream)
        watcher.destroy()
        return response
      }
    } catch (err) {
      watcher.destroy()
      log('zeromqClient rpcTry error', {err: err ? err.message : 'error', methodName, data, meta, asStream})
      throw new Error(err)
    }
  },
  push: async (eventName, data, meta) => {}
}
