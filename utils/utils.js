// VERSION 0.0.3
const R = require('ramda')
const fs = require('fs')
const path = require('path')
const PACKAGE = 'jesus'

const stringToColor = (string) => {
  var value = string.split('').map((char) => char.charCodeAt(0) * 2).reduce((a, b) => a + b, 0)
  return `hsl(${(value) % 255},80%,30%)`
}
var getConsoleInitTime = Date.now()

const safeJsonStringify = (obj, cut = true) => {
  var cache = []
  return JSON.stringify(obj, function (key, value) {
    if (typeof value === 'object' && value !== null) {
      if (cache.indexOf(value) !== -1) return
      cache.push(value)
    }
    try {
      var asString = JSON.stringify(value)
      var maxsize = 200
      if (asString.length > maxsize) {
        if (cut) return asString.substr(0, maxsize)
        return asString
      }
    } catch (error) {
      return value
    }
    return value
  }, 4)
}

function getConsole (config = {debug: false, log: true, error: true, warn: true}, serviceName, serviceId, pack, logDir = false) {
  var initTime = getConsoleInitTime
  if (!console.debug || typeof (console.debug) !== 'function') console.debug = console.log
  if (!console.warn || typeof (console.warn) !== 'function') console.warn = console.log
  return {
    profile (name) { if (!console.profile) return false; console.profile(name) },
    profileEnd (name) { if (!console.profile) return false; console.profileEnd(name) },
    error () {
      if (!config.error) return false
      var args = Array.prototype.slice.call(arguments)
      args[0] = args[0].message || args[0]
      args = args.map((arg) => safeJsonStringify(arg, false))
      console.error.apply(this, [args[0], serviceName, Date.now() - initTime, serviceId, pack].concat(args))
      console.trace()
    },
    log () {
      if (!config.log) return false
      var args = Array.prototype.slice.call(arguments)
      args = args.map((arg) => safeJsonStringify(arg))
      console.log.apply(this, [args[0], serviceName, Date.now() - initTime, serviceId, pack].concat(args))
    },
    hl () {
      if (!config.log) return false
      var args = Array.prototype.slice.call(arguments)
      // args = args.map((arg) => safeJsonStringify(arg))
      console.log('')
      console.log('----------------------HIGHLIGHT---------------------------')
      console.log.apply(this, args)
      console.log('----------------------------------------------------------')
      console.log('')
    },
    debug () {
      if (!config.debug || typeof (console.debug) !== 'function') return false
      var args = Array.prototype.slice.call(arguments)
      args = args.map((arg) => safeJsonStringify(arg))
      console.debug.apply(this, [args[0], serviceName, Date.now() - initTime, serviceId, pack].concat(args))
    },
    warn () {
      if (!config.warn || !console.warn) return false
      var args = Array.prototype.slice.call(arguments)
      args = args.map((arg) => safeJsonStringify(arg, false))
      console.warn.apply(this, [args[0], serviceName, Date.now() - initTime, serviceId, pack].concat(args))
    }
  }
}
function errorThrow (serviceName, serviceId, pack) {
  return (msg, data) => {
    getConsole(false, serviceName, serviceId, pack).warn(msg, data)
    if (data && data.error) throw data.error
    else throw msg
  }
}

module.exports = {
  checkRequired (PROPS_OBJ, PACKAGE) {
    var propsNames = Object.keys(PROPS_OBJ)
    propsNames.forEach((propName) => {
      if (!PROPS_OBJ[propName]) {
        throw `PACKAGE:${PACKAGE}  Required Dependency ${propName} is missing`
      }
    })
  },
  checkRequiredFiles (FILES, PACKAGE) {
    FILES.forEach((file) => {
      if (!fs.existsSync(file)) {
        throw `Required File ${file} is missing`
      }
    })
  },
  errorThrow,
  getConsole

}
