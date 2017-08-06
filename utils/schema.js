// VERSION 0.0.1
var request = require('request-promise-native')
var SCHEMA = {}
module.exports = (host, serviceSchema, serviceName, defaultField = 'methods') => {
  // console.log('SCHEMA', host, serviceName)
  var getSchema = async () => {
    SCHEMA = JSON.parse(await request.get(host + '/getSchema'))
    // console.log('getSchema', SCHEMA)
    // console.log('getSchema SCHEMA',await request.get(host + '/getSchema'), SCHEMA)
    // try { SCHEMA = JSON.parse(await request.get(host + '/getSchema')) } catch (error) { }
  }
  var getServiceSchema = (field = defaultField, service , exclude) => {
    if (service === '*') return Object.keys(SCHEMA).filter((serviceName) => serviceName !== exclude).map((serviceName) => { return {items: SCHEMA[serviceName][field], service: serviceName} })
    if (!SCHEMA[service] || !SCHEMA[service][field]) throw new Error(`SchemaManager get, service '${service}', field '${field}' not exists`)
    return SCHEMA[service][field]
  }
  SCHEMA[serviceName] = serviceSchema
  request.post(host + '/setServiceSchema', {form: {service: serviceName, schema:JSON.stringify(serviceSchema)}}).then(() => getSchema())
  setInterval(getSchema, 5000)
  return getServiceSchema
}
