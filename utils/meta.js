// VERSION 0.0.1
// AUTH
// async getPermissions (reqData, meta = {directCall: true}, getStream = null) {
//   return {permissions: [
//     [10, 'user.*', 0|1|2] terzo argomento come number: 0 nega i permesso, 1 passa al livello successivo, 2 da il permesso senza proseguire il check
//     [5, 'user.*', 'test2', {testParam: 34}] terzo argomento come string: si aspetta una funzione nella cartella permissions
//   ]}
// },
const getConsole = (serviceName, serviceId, pack) => require('sint-bit-utils/utils/utils').getConsole({error: true, debug: true, log: true, warn: true}, serviceName, serviceId, pack)
var PACKAGE = 'sint-bit-utils'
var CONSOLE = getConsole(PACKAGE, '----', '-----')

function optimize (rawMeta) {
  if (!rawMeta)rawMeta = {}
  var optimizedMeta = {}
  optimizedMeta.count = rawMeta.count || 0
  var sortable = []
  for (var i in rawMeta) {
    if (i[0] === '#')sortable.push([i, rawMeta[i]])
  }
  sortable.sort(function (a, b) {
    return a[1] - b[1]
  })
  optimizedMeta.tags = sortable.slice(0, 30)
  return optimizedMeta
}

module.exports = {
  optimize
}
