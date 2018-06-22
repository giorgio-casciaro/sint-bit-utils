// VERSION 0.0.1

const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'SINT BIT SCHEMA', msg, data])) }
const debug = (msg, data) => { if (process.env.debugSchema)console.log('\n' + JSON.stringify(['DEBUG', 'SINT BIT SCHEMA', msg, data])) }
const error = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'SINT BIT SCHEMA', msg, data])) }

var tryFunction = async function (func, times = 10) {
  for (var countTry = 0; countTry < times; countTry++) {
    try {
      debug('tryFunction attempt', {func: func.toString(), countTry})
      var result = await func()
      debug('tryFunction result', {func: func.toString(), haveResult: !!result})
      return result
    } catch (error) {
      debug('tryFunction error', {func: func.toString(), countTry, error: error.message})
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
}

var request = require('request-promise-native')
var SCHEMA = {id: 'schema', services: {}}
module.exports = async (host, serviceSchema, serviceName, defaultField = 'methods') => {
  // console.log('SCHEMA', host, serviceName)
  var getSchema = async () => {
    var rawSchemaString = await request.get(host + '/getSchema')
    var rawSchema = JSON.parse(rawSchemaString)
    // debug('getSchema', {rawSchemaString, rawSchema})

    // log('getSchema rawSchema', JSON.parse(rawSchema))
    if (rawSchema.services)SCHEMA = rawSchema

    // return SCHEMA;
    // console.log('getSchema', SCHEMA)
    // console.log('getSchema SCHEMA',await request.get(host + '/getSchema'), SCHEMA)
    // try { SCHEMA = JSON.parse(await request.get(host + '/getSchema')) } catch (error) { }
  }
  var sendLiveSignal = async () => {
    try {
      var rawResponse = await request.get(host + '/liveSignal?service=' + serviceName)
      var response = JSON.parse(rawResponse)
      if (response.status === 2) {
        await updateServiceSchema()
      }
    } catch (err) {
      error('sendLiveSignal error', err)
      response = error
    }
    debug('sendLiveSignal ', {serviceName, response})
  }
  var getServiceSchema = async (field = defaultField, service = serviceName, exclude) => {
    if (!SCHEMA.services[serviceName])SCHEMA.services[serviceName] = serviceSchema
    // , schemaServ: SCHEMA.services[service]
    debug('getServiceSchema', {service, field, exclude})
    var results = await tryFunction(async () => {
      if (field === '*' && service === '*' && !exclude) return SCHEMA.services
      if (service === '*') return Object.keys(SCHEMA.services).filter((serviceName) => serviceName !== exclude).map((serviceName) => { return {items: SCHEMA.services[serviceName][field], service: serviceName} })
      if (!SCHEMA.services[service] || !SCHEMA.services[service][field]) {
        log('getServiceSchema ERROR', {service, field, exclude, services: Object.keys(SCHEMA.services)})
        throw new Error(`SchemaManager get, service '${service}', field '${field}' not exists`)
      }
      return SCHEMA.services[service][field]
    })
    return results
  }
  var updateServiceSchema = async () => {
    debug('updateServiceSchema ', {serviceName})
    await tryFunction(async () => {
      debug('setServiceSchema START', {serviceName})
      await request.post(host + '/setServiceSchema', {form: {service: serviceName, schema: JSON.stringify(serviceSchema)}})
      debug('setServiceSchema END', {serviceName})
      await getSchema()
    })
  }

  await updateServiceSchema()
  setInterval(() => tryFunction(getSchema), 5000)
  setInterval(sendLiveSignal, 5000)
  return getServiceSchema
}
