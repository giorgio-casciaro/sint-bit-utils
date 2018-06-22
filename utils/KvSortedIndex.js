
module.exports = function SortedIndex ({
  dbGet = keys => false,
  dbPut = (keysValues) => false,
  dbAddItem = (chunkId, itemPosition, item) => false,
  indexName
  }) {
  //
  var defaultMeta = {
    count: 0,
    updated: Date.now(),
    chunks: [{id: 'CHUNK_1', count: 0, updated: 0, min: false, max: false}],
    chunkLength: 1000
  }
  // META
  var meta = defaultMeta
  var metaLoaded = false
  // var metaUpdated = false
  async function metaLoad (force) {
    if (metaLoaded && !force) return false
    var metaResults = await dbGet([indexName + '_meta'])
    if (metaResults)meta = metaResults[0]
    // console.log('SortedIndex loaded', meta)
    metaLoaded = true
  }
  async function metaSave () {
    await dbPut([indexName + '_meta', meta])
  }
  function metaSet (newMeta) {
    Object.assign(meta, newMeta)
    // console.log('SortedIndex metaSet', {meta})
  }
  // CHUNKS
  // async function findChunk (value) {
  //   await metaLoad()
  //   if (value < meta.chunks[0].min) return 0
  //   if (value > meta.chunks[meta.chunks.length].max) return meta.chunks.length
  //   return meta.chunks.findIndex(chunk => chunk.max >= value && chunk.min <= value)
  // }
  function chunkBST (value, inclusive = true) {
    var minIndex = 0
    var maxIndex = meta.chunks.length - 1
    var currentIndex = 0
    var currentElement
    // console.log('itemBST start', {value, minIndex, maxIndex, currentIndex})
    while (minIndex <= maxIndex) {
      currentIndex = (minIndex + maxIndex) / 2 | 0
      currentElement = meta.chunks[currentIndex]
      // console.log('itemBST', {minIndex, maxIndex, currentIndex})
      if (value > currentElement.max) {
        minIndex = currentIndex + 1
      } else if (value < currentElement.min) {
        maxIndex = currentIndex - 1
      } else {
        console.log('itemBST end1', {value, minIndex, maxIndex, currentIndex, currentElement})
        return currentIndex
      }
    }
    // console.log('itemBST end2', {value, minIndex, maxIndex, currentIndex})
    if (inclusive) {
      // if (value > currentElement) return currentIndex + 1
      return currentIndex
    }
    return false
  }
  // function chunkBST (value, inclusive = true, bottom = 0, top = meta.chunks.length - 1) {
  //   var chunk
  //   var middle
  //   var length = top - bottom
  //   if (length === 0) {
  //     if (inclusive || (value <= meta.chunks[top].max && value >= meta.chunks[top].min)) return top
  //     return false
  //   }
  //   middle = bottom + Math.floor(length / 2)
  //   chunk = meta.chunks[middle]
  //   // console.log('chunkBST', { value, newItemPosition, bottom, top, middle, chunk })
  //   if (value < chunk.min) return chunkBST(value, inclusive, bottom, middle)
  //   if (value > chunk.max && length > 1) return chunkBST(value, inclusive, middle, top)
  //   if ((value <= chunk.max && value >= chunk.min) || inclusive) return middle
  //   return false
  // }
  // function chunkBST (value, bottom = 0, top = meta.chunks.length, newItemPosition = true) {
  //   var inChunk = (chunk) => chunk.max >= value && chunk.min <= value
  //   if (value < meta.chunks[top].min) return (newItemPosition ? top : false)
  //   if (inChunk(meta.chunks[top])) return top
  //   if (top === bottom) return false
  //   if (value > meta.chunks[bottom].max) return (newItemPosition ? bottom : false)
  //   if (inChunk(meta.chunks[bottom])) return bottom
  //   if ((top - bottom) < 2) return false
  //   var middle = bottom + Math.round((top - bottom) / 2)
  //   if (inChunk(meta.chunks[middle])) return middle
  //   if (value > meta.chunks[middle].max) return chunkBST(value, middle + 1, top - 1, newItemPosition)
  // }

  function chunkId (chunkIndex = false) {
    if (chunkIndex !== false && meta.chunks[chunkIndex] && meta.chunks[chunkIndex].id) return meta.chunks[chunkIndex].id
    return 'CHUNK_' + (meta.chunks.length + 1)
  }
  async function chunkLoad (chunkIndex) {
    await metaLoad()
    var results = await dbGet([chunkId(chunkIndex)])
    if (results)itemsByChunk[chunkId(chunkIndex)] = results.items
    if (!itemsByChunk[chunkId(chunkIndex)])itemsByChunk[chunkId(chunkIndex)] = []
  }
  async function chunkSplit (chunkIndex) {
    await metaLoad()
    if (meta.chunks[chunkIndex].count > meta.chunkLength) {
      await chunkLoad(chunkIndex)
      var newChunkItems = itemsByChunk[chunkId(chunkIndex)]
      var cutIndex = Math.round(newChunkItems.length / 2)
      itemsByChunk[chunkId(chunkIndex)] = newChunkItems.splice(0, cutIndex)
      meta.chunks[chunkIndex].count = itemsByChunk[chunkId(chunkIndex)].length
      meta.chunks[chunkIndex].updated = Date.now()
      meta.chunks[chunkIndex].min = itemsByChunk[chunkId(chunkIndex)][0][0]
      meta.chunks[chunkIndex].max = itemsByChunk[chunkId(chunkIndex)][itemsByChunk[chunkId(chunkIndex)].length - 1][0]
      meta.chunks.splice(chunkIndex + 1, 0, {
        id: chunkId(),
        count: newChunkItems.length,
        updated: Date.now(),
        min: newChunkItems[0][0],
        max: newChunkItems[newChunkItems.length - 1][0]
      })
      itemsByChunk[chunkId(chunkIndex + 1)] = newChunkItems
      await chunkSaveItems(chunkIndex)
      await chunkSaveItems(chunkIndex + 1)
      metaSave()
      return true
    }
    return false
  }
  async function chunkSaveItems (chunkIndex) {
    await dbPut([chunkId(chunkIndex), {items: itemsByChunk[chunkId(chunkIndex)]}])
  }
  async function chunkAdd (chunkIndex, value, data, itemPosition = 0) {
    var item = [value, data]
    itemsByChunk[chunkId(chunkIndex)].splice(itemPosition, 0, item)
    var chunkMeta = meta.chunks[chunkIndex]
    chunkMeta.count++
    chunkMeta.updated = Date.now()
    if (value > chunkMeta.max || chunkMeta.max === false)chunkMeta.max = value
    if (value < chunkMeta.min || chunkMeta.min === false)chunkMeta.min = value
    // console.log('chunkAdd', {itemsByChunk, chunkMeta})
    var splitted = await chunkSplit(chunkIndex) // autosave if splitted
    if (!splitted) {
      await dbAddItem(chunkId(chunkIndex), itemPosition, item)
      await metaSave()
    }
    // console.log('chunkAdd', {splitted})
  }
  // ITEMS
  // function itemBST (chunkIndex, value, newItemPosition = true, bottom = 0, top = false) {
  //   var items = itemsByChunk[chunkId(chunkIndex)]
  //   if (!items.length) return 0
  //   if (top === false)top = items.length - 1
  //   var length = top - bottom
  //   if (length === 0) {
  //     if (newItemPosition) {
  //       if (value > items[top][0]) return top + 1
  //       return top
  //     }
  //     if (value === items[top][0]) return top
  //     return false
  //   }
  //   var middle = bottom + Math.floor(length / 2)
  //   console.log('itemBST', {chunkIndex, value, newItemPosition, bottom, top, middle, items, check: middle !== bottom, check2: middle !== top})
  //   if (value <= items[middle][0]) return itemBST(chunkIndex, value, newItemPosition, bottom, middle)
  //   if (value > items[middle][0] && length > 1) return itemBST(chunkIndex, value, newItemPosition, middle, top)
  //   // if (value === items[middle][0]) return middle
  //   // if (newItemPosition) {
  //   //   if (value > items[middle][0]) return middle + 1
  //   //   return middle
  //   // }
  //   // return false
  // }
  function itemBST (chunkIndex, value, newItemPosition = true) {
    var items = itemsByChunk[chunkId(chunkIndex)]
    var minIndex = 0
    var maxIndex = items.length - 1
    var currentIndex
    var currentElement
    // console.log('itemBST start', {minIndex, maxIndex, currentIndex})
    while (minIndex <= maxIndex) {
      currentIndex = (minIndex + maxIndex) / 2 | 0
      currentElement = items[currentIndex][0]
      // console.log('itemBST', {minIndex, maxIndex, currentIndex})
      if (currentElement < value) {
        minIndex = currentIndex + 1
      } else if (currentElement > value) {
        maxIndex = currentIndex - 1
      } else {
        return currentIndex
      }
    }
    if (newItemPosition) {
      if (value > currentElement) return currentIndex + 1
      return currentIndex
    }
    return false
  }

  var itemsByChunk = {

  }
  async function add (value, data) {
    await metaLoad()
    var chunkIndex = chunkBST(value)
    // console.log('chunkIndex', chunkIndex)
    await chunkLoad(chunkIndex)
    var itemPosition = itemBST(chunkIndex, value)

    // console.log('itemPosition', {itemPosition})
    await chunkAdd(chunkIndex, value, data, itemPosition)
    // console.log('itemsByChunk', itemsByChunk)
    // metaSave()
  }
  async function getItemsBetweenIndexes (indexFrom, indexTo) {
    await metaLoad()
    var chunksIndexes = []
    var items = []
    var count = 0
    var count2 = 0
    var i
    var chunk
    for (i in meta.chunks) {
      chunk = meta.chunks[i]
      if (count + chunk.count >= indexFrom && count <= indexTo) {
        if (!chunksIndexes[0])count2 = count
        chunksIndexes.push(i)
      }
      count += chunk.count
    }
    await chunkLoad(chunksIndexes)
    for (i in chunksIndexes) {
      chunk = meta.chunks[chunksIndexes[i]]
      var from = indexFrom - count2
      if (from < 0)from = 0
      var to = indexTo - count2 + 1
      if (to > count2 + chunk.count)to = count2 + chunk.count
      console.log('itemsByChunk', chunk.count, itemsByChunk[chunk.id].length, from, to)
      items = items.concat(itemsByChunk[chunk.id].slice(from, to))
      count2 += chunk.count
    }
    // for (i in meta.chunks) {
    //   chunk = meta.chunks[i]
    //   if (chunksIndexes.indexOf(i) >= 0) {
    //     var from = indexFrom - count
    //     if (from < 0)from = 0
    //     var to = indexTo - count + 1
    //     if (to > count + chunk.count)to = count + chunk.count
    //     console.log('itemsByChunk', chunk.count, itemsByChunk[chunk.id].length, from, to)
    //     items = items.concat(itemsByChunk[chunk.id].slice(from, to))
    //   }
    //   // items.concat(chunkGetItemsBetweenIndexes(indexFrom, indexTo))
    //   count += chunk.count
    // }
    return items
  }
  return {
    add,
    metaSet,
    meta,
    itemsByChunk,
    getItemsBetweenIndexes
  }
}
