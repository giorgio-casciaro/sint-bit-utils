
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
var emit = (eventName, eventData, internal = true) => {
  var event = [eventName, eventData, internal]
  log('netClient emit', {event, netClientListenersByService})
  if (captureEmitQueue) {
    if (!emitQueue[eventName])emitQueue[eventName] = []
    emitQueue[eventName].push(event)
    // log('emitQueue', {emitQueue})
  }
  log('netClient emit netClientListeners', {netClientListeners: netClientListeners[eventName], netClientListenersByService: netClientListenersByService[eventName]})

  if (netClientListeners[eventName])netClientListeners[eventName].forEach((listener) => listener.eventFunction(event))
  if (netClientListenersByService[eventName]) {
    for (var serviceName in netClientListenersByService[eventName]) {
      var service = netClientListenersByService[eventName][serviceName]
      var listenerIndex = service.roundRobinIndex % service.listeners.length
      log('netClient listenerIndex', {eventName, serviceName, listenerIndex, eventFunction: service.listeners[listenerIndex].eventFunction.toString()})
      service.listeners[listenerIndex].eventFunction(event, serviceName, netClientListenersByService[eventName])
      service.roundRobinIndex++
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
class netClientMultiStreamEmitter extends require('events') {}

var methods = {
  testPuppets: {},
  getEmitQueue: (eventName) => {
    if (!captureEmitQueue) return []
    return emitQueue[eventName] || []
  },
  listen: async (serviceName, method, params) => {
    // serviceRequests=[{serviceName, method, params}]
    var multiStream = new netClientMultiStreamEmitter()
    multiStream.destroy = () => {
      multiStream.streamManager.destroy()
    }
    var addedStream = (stream) => {
      multiStream.emit('addedStream', stream)
      log('listen addedStream', {streamInfo: stream.info})
      stream.on('readable', () => {
        let data
        while (data = stream.read()) {
          log('listen streamEvent', {data, streamInfo: stream.info})
          multiStream.emit('streamEvent', data.concat(stream.info))
        }
      })
      .on('error', (data) => log('listen error', {streamInfo: stream.info}))
      .on('end', (data) => log('listen end', {streamInfo: stream.info}))
    }
    var removedStream = (stream) => {
      log('listen removedStream', {streamInfo: stream.info})
      multiStream.emit('removedStream', stream)
    }
    multiStream.streamManager = await methods.rpc(serviceName, method, params, {}, true, true, addedStream, removedStream)
    return multiStream
  },
  // listen: async (serviceRequests) => {
  //   // serviceRequests=[{serviceName, method, params}]
  //   var multiStream = new netClientMultiStreamEmitter()
  //   multiStream.streamManagers = []
  //   multiStream.destroy = () => {
  //     multiStream.streamManagers.forEach((streamManager) => streamManager.destroy())
  //     multiStream.streamManagers = []
  //   }
  //   var addedStream = (stream) => {
  //     multiStream.emit('addedStream', stream)
  //     log('listen addedStream', {streamInfo: stream.info})
  //     stream.on('readable', () => {
  //       let data
  //       while (data = stream.read()) {
  //         log('listen streamEvent', {data, streamInfo: stream.info})
  //         multiStream.emit('streamEvent', data.concat(stream.info))
  //       }
  //     })
  //     .on('error', (data) => log('listen error', {streamInfo: stream.info}))
  //     .on('end', (data) => log('listen end', {streamInfo: stream.info}))
  //   }
  //   var removedStream = (stream) => {
  //     log('listen removedStream', {streamInfo: stream.info})
  //     multiStream.emit('removedStream', stream)
  //   }
  //   for (var i in serviceRequests) {
  //     multiStream.streamManagers.push(await methods.rpc(serviceRequests[i].serviceName, serviceRequests[i].method, serviceRequests[i].params, {}, true, true, addedStream, removedStream))
  //   }
  //   return multiStream
  // },
  on: (eventName, eventFunction, eventService, emitOldQueueOnFirstListener = false) => {
    log('netClient on', eventName, eventFunction, eventService)
    // if (emitOldQueueOnFirstListener && !netClientListeners[eventName] && !netClientListenersByService[eventName]) var emitQueueAtEnd = true
    if (eventService) {
      if (!netClientListenersByService[eventName])netClientListenersByService[eventName] = {}
      if (!netClientListenersByService[eventName][eventService])netClientListenersByService[eventName][eventService] = {roundRobinIndex: 0, listeners: []}
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
      for (var serviceName in netClientListenersByService[eventName]) {
        var service = netClientListenersByService[eventName][serviceName]
        service.listeners = service.listeners.filter((listener) => listener.eventFunction !== eventFunction)
      }
      // for (var service in netClientListenersByService[eventName]) {
      //   service.listeners = service.listeners.filter((listener) => listener.eventFunction !== eventFunction)
      // }
    }
  },
  rpc: async (serviceName, methodName, data, meta, asStream, toEveryTask = false, addedStream = false, removedStream = false, specificHost = false) => {
    var hostToPath = (host) => 'tcp://' + host + ':81'

    // var zeromqClientConnectionsValid = []
    // while (!zeromqClientConnectionsValid.length) {
    //   var zeromqClientConnections = await Promise.all(watcher.getHosts().map((host) => zeromqClient.getConnection('tcp://' + host + ':81')))
    //   zeromqClientConnectionsValid = zeromqClientConnections.filter((conn) => conn.connected)
    //   var validPaths = zeromqClientConnectionsValid.map((conn) => conn.path)
    //   if (!zeromqClientConnectionsValid.length) await new Promise((resolve) => setTimeout(resolve, 100))
    // }
    // log('validPaths', {serviceName, validPaths})
    var mainWatcher = await serviceWatcher.getServiceMainWatcher(serviceName)
    var conns = null
    var conn = null
    var hosts = null

    try {
      log('rpc', {serviceName, methodName, data, toEveryTask, asStream, hosts: mainWatcher.hosts})
      if (toEveryTask && asStream) {
        while (!conns) {
          hosts = specificHost ? [specificHost] : mainWatcher.hosts
          if (hosts) conns = await zeromqClient.getConnectedConnections(hosts.map(hostToPath))
          if (!conns || conns.length !== hosts.length) await new Promise((resolve) => setTimeout(resolve, 300))
        }
        var streams = await Promise.all(conns.map((conn) => conn.rpc(methodName, data, meta, asStream)))
        streams = streams.filter((stream) => !!stream)
        streams.forEach(addedStream)

        var onAddedHost = async function (host, service) {
          log('addedHost', {host, service, methodName, data, meta, asStream})
          if (service === serviceName) {
            var conn = await zeromqClient.getConnection(hostToPath(host))
            var stream = await conn.rpc(methodName, data, meta, asStream)
            if (stream) {
              streams.push(stream)
              if (addedStream)addedStream(stream)
            } else log('addedHost get stream error', {host, service, methodName, data})
          }
        }
        mainWatcher.on('addedHost', onAddedHost)
        var streamsManager = {
          streams,
          destroy: () => {
            mainWatcher.listeners--
            streamsManager.streams.forEach(stream => { if (stream)stream.destroy() })
            delete streamsManager.streams
            mainWatcher.off('addedHost', onAddedHost)
          }
        }
        return streamsManager
      } else if (toEveryTask && !asStream) {
        while (!conns) {
          hosts = specificHost ? [specificHost] : mainWatcher.hosts
          if (hosts) conns = await zeromqClient.getConnectedConnections(hosts.map(hostToPath))
          if (!conns || conns.length !== hosts.length) await new Promise((resolve) => setTimeout(resolve, 300))
        }
        var responses = await Promise.all(conns.map((conn) => conn.rpc(methodName, data, meta, asStream)))
        return responses
      } else {
        while (!conn) {
          hosts = specificHost ? [specificHost] : mainWatcher.hosts
          log('hosts', {serviceName, methodName, hosts})
          if (hosts && hosts.length) conns = await zeromqClient.getConnectedConnections(hosts.map(hostToPath))
          if (conns) log('conns', {connIndex: Math.floor(Math.random() * conns.length)})
          if (conns) conn = conns[Math.floor(Math.random() * conns.length)]
          if (!conn) await new Promise((resolve) => setTimeout(resolve, 300))
        }
        var response = await conn.rpc(methodName, data, meta, asStream)
        return response
      }
    } catch (err) {
      debug('zeromqClient rpcTry error', {err: err ? err.message : 'error', methodName, data, meta, asStream})
      throw new Error(err)
    }
  },
  push: async (eventName, data, meta) => {}
}
module.exports = methods
