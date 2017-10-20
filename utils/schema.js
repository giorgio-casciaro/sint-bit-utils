// VERSION 0.0.1
var request = require('request-promise-native')
var SCHEMA = {}
module.exports = (host, serviceSchema, serviceName, defaultField = 'methods') => {
  // console.log('SCHEMA', host, serviceName)
  var getSchema = async () => {
    SCHEMA = JSON.parse(await request.get(host + '/getSchema'))
    // return SCHEMA;
    // console.log('getSchema', SCHEMA)
    // console.log('getSchema SCHEMA',await request.get(host + '/getSchema'), SCHEMA)
    // try { SCHEMA = JSON.parse(await request.get(host + '/getSchema')) } catch (error) { }
  }
  var sendLiveSignal = async () => {
    try {
      var response = await request.get(host + '/liveSignal?service=' + serviceName)
      if (response.status === 2) {
        updateServiceSchema()
      }
    } catch (error) {
      response = error
    }
    console.log('')
    console.log('---------------sendLiveSignal-------------------')
    console.log('response', serviceName)
    console.log(response)
    console.log('------------------------------------------------')
    console.log('')
  }
  var getServiceSchema = (field = defaultField, service = serviceName, exclude) => {
    // console.log('getServiceSchema', service, field, exclude, SCHEMA[service])
    if (field === '*' && service === '*' && !exclude) return SCHEMA
    if (service === '*') return Object.keys(SCHEMA).filter((serviceName) => serviceName !== exclude).map((serviceName) => { return {items: SCHEMA[serviceName][field], service: serviceName} })
    if (!SCHEMA[service] || !SCHEMA[service][field]) throw new Error(`SchemaManager get, service '${service}', field '${field}' not exists`)
    return SCHEMA[service][field]
  }
  var updateServiceSchema = () => {
    console.log('')
    console.log('---------------updateServiceSchema-------------------')
    console.log('response', serviceName)
    console.log('------------------------------------------------')
    console.log('')
    request.post(host + '/setServiceSchema', {form: {service: serviceName, schema: JSON.stringify(serviceSchema)}}).then(() => getSchema())
  }
  SCHEMA[serviceName] = serviceSchema

  updateServiceSchema()
  setInterval(getSchema, 5000)
  setInterval(sendLiveSignal, 5000)
  return getServiceSchema
}
