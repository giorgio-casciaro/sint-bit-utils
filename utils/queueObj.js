// VERSION 0.0.3

module.exports = (resultsError) => () => {
  var resultsQueue = []
  var errorsIndex = []
  var dataToResolve = []
  return {
    dataToResolve,
    add: (id, data) => {
      var dataToResolveIndex = dataToResolve.push({ id, data }) - 1
      resultsQueue.push({id, __RESULT_TYPE__: 'resultsToResolve', index: dataToResolveIndex})
    },
    addError: (item, error) => {
      errorsIndex.push(resultsQueue.length)
      resultsQueue.push(resultsError(item, error))
    },
    resolve: async (func) => {
      if (dataToResolve.length) {
        var resolvedResults = await func(dataToResolve)
        resultsQueue = resultsQueue.map((data) => data.__RESULT_TYPE__ === 'resultsToResolve' ? resolvedResults[data.index] : data)
      }
    },
    returnValue: () => {
      var returnValue = {results: resultsQueue}
      if (errorsIndex.length)returnValue.errors = errorsIndex
      return returnValue
    }
  }
}
