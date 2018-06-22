process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
  // application specific logging, throwing an error, or other logic here
})
var mainTest = require('./microTest')('TEST', 0)
var SortedIndex = require('./KvSortedIndex')
var microTest = mainTest.test
var finishTest = mainTest.finish
function log (msg, data) {
  console.log('--------------------------------')
  console.log(msg)
  console.log(data)
  console.log('--------------------------------')
}
var startTest = async function (netClient) {
  // const TYPE_OF = (actual, expected) => {
  //   if (typeof (expected) !== 'object') {
  //     var type = typeof (actual)
  //     if (Array.isArray(actual))type = 'array'
  //     return type
  //   }
  //   var filtered = {}
  //   Object.keys(expected).forEach((key) => { filtered[key] = typeof actual[key] })
  //   return filtered
  // }
  // const FILTER_BY_KEYS = (actual, expected) => {
  //   var filtered = {}
  //   Object.keys(expected).forEach((key) => { filtered[key] = actual[key] })
  //   return filtered
  // }
  // const COUNT = (actual, expected) => actual.length
  //
  mainTest.consoleResume()
  log('SortedIndex', SortedIndex)
  var index = SortedIndex({})
  await index.metaSet({chunkLength: 10})

  for (var c = 0; c <= 100; c++) {
    // for (var i = 0; i <= 10; i++) {
      // await index.add(Math.floor(Math.random() * 100), {test: 'test'})
    await index.add(c, {test: 'test'})
    // }
    // log(c, index)
  }
  log('index', index)
  // log('index.meta.chunks', index.meta.chunks)
  // log('itemsByChunk', index.itemsByChunk)
  index.meta.chunks.forEach((chunk, i) => log(i, {chunk, items: index.itemsByChunk[chunk.id]}))
  index.meta.chunks.forEach((chunk, i) => log(i, {checkCount: index.itemsByChunk[chunk.id].length === chunk.count}))

  var itemsBetweenIndexes = await index.getItemsBetweenIndexes(10, 50)
  log('getItemsBetweenIndexes', {length: itemsBetweenIndexes.length, itemsBetweenIndexes})
  // var getItemsBetweenValues = await index.getItemsBetweenValues(10, 50)
  // log('getItemsBetweenIndexes', {length: itemsBetweenIndexes.length, itemsBetweenIndexes})
  mainTest.consoleMute()
  //
  finishTest()
}
startTest()
