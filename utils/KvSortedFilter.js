
var SortedIndex = require('./KvSortedIndex')
module.exports = function SortedFilter ({
  dbGet = keys => false,
  dbPut = (keysValues) => false,
  dbAddItem = (chunkId, itemPosition, item) => false,
  indexName,
  filterName,
  filterFunction}) {
  var filterCache = SortedIndex({ dbGet, dbPut, dbAddItem, indexName: 'filter_' + indexName + '_' + filterName })
  var sortedIndex = SortedIndex({ dbGet, dbPut, dbAddItem, indexName })
  async function getItems (from, to) {
    var length = from - to + 1
    var filterCacheMeta = filterCache.getItemsBetweenIndexes(from, to)
    var filterCacheItems = filterCache.getItemsBetweenIndexes(from, to)
    if (filterCacheItems.length < length) {

    }
  }
  return {
    getItems
  }
}
