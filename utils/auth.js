// VERSION 0.0.1
// AUTH
// async getPermissions (reqData, meta = {directCall: true}, getStream = null) {
//   return {permissions: [
//     [10, 'user.*', 0|1|2] terzo argomento come number: 0 nega i permesso, 1 passa al livello successivo, 2 da il permesso senza proseguire il check
//     [5, 'user.*', 'test2', {testParam: 34}] terzo argomento come string: si aspetta una funzione nella cartella permissions
//   ]}
// },

var jwt = require('jsonwebtoken')
const getTokenData = (token, jwtConfig) => new Promise((resolve, reject) => {
  jwt.verify(token, jwtConfig.publicCert, (err, decoded) => { if (err) reject(err); else resolve(decoded) })
})
module.exports = {
  async createToken (permissions, meta, jwtConfig) {
    permissions = permissions.reduce((a, b) => a.concat(b.permissions), [])
    var tokenData = { permissions, exp: Math.floor(Date.now() / 1000) + (60 * 60) }
    return await new Promise((resolve, reject) => {
      jwt.sign(tokenData, jwtConfig.privateCert, { algorithm: 'RS256' }, (err, token) => { if (err) reject(err); else resolve(token) })
    })
  },
  getTokenData,
  async userCan (permission, meta, jwtConfig) {
    var tokenData = await getTokenData(meta.token, jwtConfig)
    var permissionsSorted = tokenData.permissions.sort((a, b) => b[0] - a[0])
    var permissionsByLevel = Object.values(permissionsSorted.reduce((a, b) => {
      if (!a[b[0]])a[b[0]] = []
      a[b[0]].push(b.slice(1))
      return a
    }, {}))

    var checkPermissionName = (permissionToCheck) => {
      if (permissionToCheck === permission) return true
      permissionToCheck = permissionToCheck.replace(new RegExp('([\\.\\\\\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}\\=\\!\\<\\>\\|\\:\\-])', 'g'), '\\$1')
      permissionToCheck = permissionToCheck.replace(/\\\*/g, '(.*)').replace(/_/g, '.')
      var check = RegExp('^' + permissionToCheck + '$', 'gi').test(permission)
      return check
    }
    var havePermission = false
    for (var levelPermissions of permissionsByLevel) {
      var levelPermissionsValues = []
      levelPermissions.forEach((sp) => {
        var spName = sp[0]
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

      console.log('PERMISSIONS levelPermissionsValues', levelPermissionsValues, levelPermissions)
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
    // 1(one or more) go to next loop
      havePermission = true
    }
    console.log('PERMISSIONS havePermission', havePermission)
  // var havePermission = (tokenData.permissions.indexOf(permission) < 0)
    if (!havePermission) throw new Error('No permission')
  }
}
