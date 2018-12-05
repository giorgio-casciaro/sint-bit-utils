const fs = require('fs')
const path = require('path')
const uuid = require('uuid/v4')

const CONSOLE = require('./utils').getConsole({error: true, debug: true, log: true, warn: true}, 'NPM_PIC', 'NPM_PIC', 'NPM_PIC')
// const getPicPath = (uploadPath, id, type = 'mini', format = 'jpeg') => path.join(uploadPath, `pic-${type}-${id}.${format}`)
// const unlinkFile = (file) => new Promise((resolve, reject) => fs.unlink(file, (err, data) => err ? resolve(err) : resolve(data)))

const resizeAndGetBuffers = async function (originalPicBuffer, sizes = [['mini', 100, 100]]) {
  var sharp = require('sharp')
  var restunObj = {}

  // FULL SIZE
  var baseImg = sharp(originalPicBuffer).resize(2000, 2000).max()
  restunObj.full = await baseImg.toBuffer()
  // SIZES
  for (var i = sizes.length; i--;) {
    var size = sizes[i]
    restunObj[size[0]] = await baseImg.resize(size[1], size[2]).crop().toBuffer()
  }
  // unlinkFile(originalPicPath)
  return restunObj
}

module.exports = {
  resizeAndGetBuffers
}
