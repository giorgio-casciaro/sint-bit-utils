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

var jwt = require('jsonwebtoken')
const createToken = async function (userId, permissions, meta, jwtConfig) {
  // var id = uuid()
  // CONSOLE.hl('createToken permissions', permissions, typeof (permissions[0]))
  if (!permissions[0] || !permissions[0][0])permissions = permissions.reduce((a, b) => a.concat(b.permissions), [])
  var tokenData = { permissions, id: userId, exp: Math.floor(Date.now() / 1000) + (60 * 60) }
  CONSOLE.hl('tokenData', tokenData)
  var token = await new Promise((resolve, reject) => {
    jwt.sign(tokenData, jwtConfig.privateCert, { algorithm: 'RS256' }, (err, token) => { if (err) reject(err); else resolve(token) })
  })
  CONSOLE.hl('tokenData2', await getTokenData(token, jwtConfig))
  return token
}
const getTokenData = (token, jwtConfig) => new Promise((resolve, reject) => {
  jwt.verify(token, jwtConfig.publicCert, (err, decoded) => { if (err) reject(err); else resolve(decoded) })
})
const refreshToken = async function (token, jwtConfig) {
  var tokenData = await getTokenData(token, jwtConfig)
  CONSOLE.hl('tokenData', tokenData)
  var newToken = await createToken(tokenData.id, tokenData.permissions, {}, jwtConfig)
  return newToken
}
// const checkValidity = (token, jwtConfig) => new Promise((resolve, reject) => {
//   jwt.verify(token, jwtConfig.publicCert, (err, decoded) => { if (err) reject(err); else resolve(decoded) })
// })
module.exports = {
  createToken,
  async getUserIdFromToken (meta, jwtConfig) {
    try {
      if (!jwtConfig || !meta || !meta.token) throw new Error('getUserIdFromToken need meta.token and jwtConfig')
      var tokenData = await getTokenData(meta.token, jwtConfig)
      // console.log('getUserIdFromToken', tokenData.id)
      return tokenData.id
    } catch (error) {
      return 0
    }
  },
  getTokenData,
  refreshToken,
  async userCan (permission, meta, jwtConfig) {
    try {
    // console.log('userCan', {jwtConfig})
      var tokenData = await getTokenData(meta.token, jwtConfig)
      CONSOLE.hl('userCan tokenData', tokenData)
    // checkValidity(meta.token, jwtConfig)
    // console.log('tokenData', tokenData)
      var permissionsSorted = tokenData.permissions.sort((a, b) => b[0] - a[0])
      console.log('permissionsSorted', permissionsSorted)
      var permissionsByLevel = Object.values(permissionsSorted.reduce((a, b) => {
        if (!a[b[0]])a[b[0]] = []
        a[b[0]].push(b.slice(1))
        return a
      }, {}))

    // console.log('permissionsByLevel', permissionsByLevel)
      var checkPermissionName = (permissionToCheck) => {
      // console.log('permissionToCheck', permissionToCheck, permission)
        if (permissionToCheck === permission) return true
        permissionToCheck = permissionToCheck.replace(new RegExp('([\\.\\\\\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}\\=\\!\\<\\>\\|\\:\\-])', 'g'), '\\$1')
        permissionToCheck = permissionToCheck.replace(/\\\*/g, '(.*)').replace(/_/g, '.')
        var check = RegExp('^' + permissionToCheck + '$', 'gi').test(permission)
      // console.log('permissionToCheck2', permissionToCheck, permission, check)
        return check
      }
      var havePermission = false
      for (var levelPermissions of permissionsByLevel) {
        var levelPermissionsValues = []
        levelPermissions.forEach((sp) => {
          var spName = sp[0]
        // console.log('checkPermissionName', spName,checkPermissionName(spName))
          if (checkPermissionName(spName)) {
            var spValue
            if (typeof sp[1] === 'number') {
              spValue = sp[1]
            } else if (typeof sp[1] === 'string') {
              var spFunc = require(jwtConfig.path + sp[1])
              var spArgs = sp[2]
              spValue = spFunc(permission, meta, spArgs)
            }
            levelPermissionsValues.push(spValue)
          }
        })

      // console.log('PERMISSIONS levelPermissionsValues', levelPermissionsValues, levelPermissions)
      // 0(one or more) stop loop and deny permission,
        if (levelPermissionsValues.indexOf(0) !== -1) {
          havePermission = false
          break
        }
    // 2(one or more) stop loop and give permission,
        if (levelPermissionsValues.indexOf(2) !== -1) {
          havePermission = true
          break
        }
        if (levelPermissionsValues.indexOf(1) !== -1) {
          havePermission = true
      // break
        }
    // 1(one or more) go to next loop
      // havePermission = true
      }
    // console.log('PERMISSIONS havePermission', havePermission)
  // var havePermission = (tokenData.permissions.indexOf(permission) < 0)
      if (!havePermission) throw new Error('No permission')
    } catch (error) {
      throw new Error('userCan - ' + error)
    }
  }
}
