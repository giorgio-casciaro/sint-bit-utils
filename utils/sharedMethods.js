var netClient
var serviceMethods
var serviceInfo
process.env.debugMain = true
// process.env.debugCouchbase = true
// process.env.debugJesus = true
// process.env.debugSchema = true

const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'MAIN', msg, data])) }
const debug = (msg, data) => { if (process.env.debugMain)console.log('\n' + JSON.stringify(['DEBUG', 'MAIN', msg, data])) }
const errorLog = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'MAIN', msg, data])); console.error(data) }

// -----------------------------------------------------------------
// const EventEmitter = require('events')
// class MicroserviceEventEmitter extends EventEmitter {  }
// var microserviceEventEmitter = new MicroserviceEventEmitter()
var getEventsConnectedServices = { }
var serviceMethods = {
  init: async function (setNetClient, setServiceMethods) {
    netClient = setNetClient
    serviceMethods = setServiceMethods
    serviceInfo = await serviceMethods.serviceInfo.exec()
  },
  emitEvent: {
    config: { public: false, stream: false, upload: false },
    request: { properties: { 'type': { type: 'string' }, 'data': { type: 'object' } } },
    response: false,
    exec: async function (reqData, meta = { directCall: true, is_test: false }, getStream = null) {
      netClient.emit(reqData.type, reqData.data)
      return { success: `Event Emitted` }
    }
  },
  getEvents: {
    config: { public: true, stream: true, upload: false, warmUp: 0 },
    request: { properties: { 'type': { type: ['array', 'string'] }, 'service': { type: 'string' }, 'filter': { type: 'string' }, 'filterData': { type: 'object' }, 'getQueue': { type: 'boolean' } } },
    response: false,
    exec: async function (reqData, meta = { directCall: true }, getStream = null) {
      if (!(reqData.type instanceof Array)) {
        reqData.type = [reqData.type]
      }
      var stream = getStream()
      // var filters = {
      //   byViewIdAndMutationField: {
      //     init: () => {
      //      },
      //     exec: (eventInfo) => {
      //       if (!reqData.filterData.viewsAndFields) return null
      //       var eventData = eventInfo[1]
      //       if (!eventData.mutation || !eventData.objId) return null
      //       if (eventData.mutation === 'create') return eventInfo
      //       log('eventInfo', eventInfo)
      //       log('mutationsInfo', mutationsInfo)
      //       log('filterData', reqData.filterData)
      //       var viewFields = reqData.filterData.viewsAndFields[eventData.objId]
      //       log('viewFields', viewFields)
      //       if (viewFields) {
      //         log('mutationsInfo[eventData.mutation]', mutationsInfo[eventData.mutation])
      //         if (mutationsInfo[eventData.mutation].fieldsWrite.indexOf('*') > -1) return eventInfo
      //         for (var i in viewFields) {
      //           if (mutationsInfo[eventData.mutation].fieldsWrite.indexOf(viewFields[i]) > -1) return eventInfo
      //          }
      //        }
      //       return null
      //      }
      //    }
      //  }
      var filterFunc = false
      if (reqData.filter) {
        var vm = require('vm')
        const sandbox = { filterFunc: false }
        vm.createContext(sandbox)
        vm.runInContext('filterFunc = ' + reqData.filter, sandbox)
        filterFunc = sandbox.filterFunc
      }
      var listener = (event) => {
        log('getEvents event', { event })
        var isInternalEvent = event[2]
        console.log('getEvents event before filterFunc', isInternalEvent, filterFunc)
        if (isInternalEvent) {
          if (reqData.filter && filterFunc) {
            log('getEvents filterData params', { serviceInfo })
            var sendEvent = filterFunc(reqData.filterData, event, serviceInfo, log)
            console.log('getEvents event filterFunc', sendEvent)
            if (sendEvent !== null)stream.write([1, sendEvent[0], sendEvent[1]])
          } else {
            stream.write([1, event[0], event[1]])
          }
        }
        // try {  stream.write(event)  } catch (err) {
        //   log('getEvents stream error', err)
        //   stream.end(event)
        //   netClient.off(reqData.type, listener)
        //  }
      }
      log('getEvents stream start', reqData)
      stream.on('finish', () => reqData.type.forEach((type) => netClient.off(type, listener)))
      stream.on('end', () => log('getEvents stream end', reqData))
      stream.on('close', () => log('getEvents stream close', reqData))
      stream.on('finish', () => log('getEvents stream finish', reqData))
      stream.on('error', () => log('getEvents stream error', reqData))
      stream.on('destroy', () => log('getEvents stream destroy', reqData))
      // stream.on('readable', () => {
      //   var chunk
      //   while ((chunk = stream.read()) !== null) {
      //     if (chunk.command) {
      //       if (chunk.command === 'filterByViewIdAndMutationField_Add') {
      //         if (chunk.viewIds)chunk.viewIds.forEach((viewId) => reqData.filterData.viewsAndFields.push(viewId))
      //         if (chunk.mutationFields)chunk.mutationFields.forEach((mutationField) => reqData.filterData.mutationFields.push(mutationField))
      //         log('updated reqData.filterData', { chunk, filterData: reqData.filterData })
      //        }
      //       if (chunk.command === 'filterByViewIdAndMutationField_Remove') {
      //         if (chunk.viewIds)chunk.viewIds.forEach((viewId) => reqData.filterData.viewsAndFields.splice(reqData.filterData.viewsAndFields.indexOf(viewId), 1))
      //         if (chunk.mutationFields)chunk.mutationFields.forEach((mutationField) => reqData.filterData.mutationFields.splice(reqData.filterData.mutationFields.indexOf(mutationField), 1))
      //         log('updated reqData.filterData', { chunk, filterData: reqData.filterData })
      //        }
      //      }
      //     log('getEvents stream readable chunk', chunk)
      //     stream.write({ log: 'command received' })
      //    }
      //  })
      stream.on('data', (data) => {
        log('getEvents stream data received', data)
        if (data.command) {
          if (data.command === 'filterApplyPatch') {
            var rfc6902 = require('rfc6902')
            log('filterApplyPatch before', reqData.filterData)
            rfc6902.applyPatch(reqData.filterData, data.patch)
            log('filterApplyPatch after', reqData.filterData)
          }
          log('getEvents stream readable data', data)
          stream.write([0, 'log', 'command ' + data.command + ' received'])
        }
      })
      reqData.type.forEach((type) => netClient.on(type, listener, reqData.service, true))
      if (reqData.service && reqData.getQueue) {
        if (!getEventsConnectedServices[meta.service]) {
          getEventsConnectedServices[meta.service] = true
          reqData.type.forEach((type) => netClient.getEmitQueue(reqData.type).forEach((eventData) => listener(eventData)))
        }
      }
      stream.write([0, 'log', 'connected'])
    }
  },
  emitEvent: {
    config: { public: false, stream: false, upload: false },
    request: { properties: { 'type': { type: 'string' }, 'data': { type: 'object' } } },
    response: false,
    exec: async function (reqData, meta = { directCall: true }, getStream = null) {
      // if (!getEventsConnected) return { error: `no getEventsConnected`, data: { meta } }
      log('emitEvent reqData', reqData)
      netClient.emit(reqData.type, reqData.data)
      return { success: `Event Emitted`, data: { reqData } }
    }
  },
  osInfo: {
    config: { public: false, stream: false, upload: false },
    request: { },
    response: false,
    exec: async function (reqData, meta = { directCall: true }, getStream = null) {
      var os = require('os')
      // return { success: `osInfo`, data: { cpus: os.cpus(), totalmem: os.totalmem(), freemem: os.freemem(), hostname: os.hostname(), loadavg: os.loadavg(), networkInterfaces: os.networkInterfaces(), uptime: os.uptime() } }
      return { success: `osInfo`, data: { totalmem: os.totalmem(), freemem: os.freemem(), hostname: os.hostname(), loadavg: os.loadavg(), uptime: os.uptime() } }
    }
  }
}
module.exports = serviceMethods
