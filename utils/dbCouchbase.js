// var ViewQuery = couchbase.ViewQuery;
// var query = ViewQuery.from('beer', 'by_name').skip(6).limit(3);
// myBucket.query(query, function(err, results) {
//   for(i in results)
//     console.log(results[i]);
// })
// ;
//
// function list_beers(req, res) {
//     var q = ViewQuery.from('beer', 'by_name')
//         .limit(ENTRIES_PER_PAGE)
//         .stale(ViewQuery.Update.BEFORE);
//     bucket.query(q, function(err, values) {
//       // 'by_name' view's map function emits beer-name as key and value as
//       // null. So values will be a list of
//       //      [ {id: <beer-id>, key: <beer-name>, value: <null>}, ... ]
//
//       // we will fetch all the beer documents based on its id.
//       var keys = _.pluck(values, 'id');
//
//       db.getMulti( keys, function(err, results) {
//
//         // Add the id to the document before sending to template
//         var beers = _.map(results, function(v, k) {
//           v.value.id = k;
//           return v.value;
//         });
//
//         res.render('beer/index', {'beers':beers});
//       })
//     });
//   }

var couchbase = require('couchbase')

var cluster
var clusterManager
var checkedBucket = {}
var cacheBucket = {}
var createBucket = (bucketName) => new Promise((resolve, reject) => {
  clusterManager.createBucket(bucketName, { ramQuotaMB: 100 }, async function (err) {
    console.log('// couchbase createBucket // ', {bucketName, err})
    if (err) return reject(err)
    checkedBucket[bucketName] = true
    return resolve(true)
  })
})
var openBucket = (bucketName) => new Promise(async (resolve, reject) => {
  await createBucketIfNotExists(bucketName)
  if (cacheBucket[bucketName]) return resolve(cacheBucket[bucketName])
  var bucket = cluster.openBucket(bucketName, '', function (err) {
    console.log('// couchbase openBucket // ', {bucketName, err})
    if (err) return reject(err)
    cacheBucket[bucketName] = bucket
    resolve(bucket)
  })
})
var upsert = (bucket, id, doc) => new Promise((resolve, reject) => {
  bucket.upsert(id, doc, function (err, result) {
    console.log('// couchbase upsert // ', {id, doc, err, result})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var get = (bucket, id) => new Promise((resolve, reject) => {
  bucket.get(id, function (err, result) {
    console.log('// couchbase get // ', {id, err, result})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var createIndex = (bucket, fields) => new Promise((resolve, reject) => {
  bucket.manager().createIndex(bucket._name + '_' + fields.join('_'), fields, {ignoreIfExists: true}, function (err, result) {
    console.log('// couchbase createIndex // ', {bucketName: bucket._name, fields})
    if (err) return reject(err)
    else return resolve(result)
  })
})
var query = (bucket, statement, argsArray = [], waitIndexUpdate = false, adhoc = false) => new Promise((resolve, reject) => {
  bucket.query(couchbase.N1qlQuery.fromString(statement).adhoc(adhoc).readonly(true).consistency(waitIndexUpdate ? couchbase.N1qlQuery.Consistency.REQUEST_PLUS : couchbase.N1qlQuery.Consistency.NOT_BOUNDED), argsArray, function (error, result) {
    console.log('// couchbase query // ', {statement, argsArray, error, result})
    if (error) return reject(error)
    resolve(result)
  })
})
var tryFunction = async function (func, times = 10) {
  console.log('// couchbase tryFunction  // ', func)
  for (var countTry = 0; countTry < times; countTry++) {
    console.log('// couchbase tryFunction  try// ', countTry)
    try {
      var result = await func()
      return result
    } catch (error) {
      console.log('// couchbase tryFunction error // ', {func, countTry, error})
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}
var createBucketIfNotExists = (bucketName) => new Promise((resolve, reject) => {
  console.log('// couchbase createBucketIfNotExists// ', bucketName, checkedBucket[bucketName])
  if (checkedBucket[bucketName]) return resolve(true)
  listBuckets(bucketName).then(async(bucketsList) => {
    if (bucketsList.indexOf(bucketName) === -1) {
      console.log('// couchbase bucket not exists // ', {bucketName})
      await tryFunction(() => createBucket(bucketName))
      resolve(true)
    } else resolve(true)
    checkedBucket[bucketName] = true
  }, reject)
})
var listBuckets = (namesOnly = true) => new Promise((resolve, reject) => {
  console.log('// couchbase listBuckets // ')
  clusterManager.listBuckets(function (err, result) {
    console.log('// couchbase listBuckets // ', { err, result_length: result.length })
    if (err) return reject(err)
    else return resolve(namesOnly ? result.map((bucket) => bucket.name) : result)
  })
})

module.exports = {
  async init (url, username, password) {
    cluster = new couchbase.Cluster(url)
    cluster.authenticate(username, password)
    clusterManager = cluster.manager(username, password)
    console.log('// couchbase init // ', {url, username, password})
  },
  async put (bucketName, id, doc) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    // var result = await upsert(bucket, id, doc)
    var result = await tryFunction(() => upsert(bucket, id, doc))
    return result
  },
  async get (bucketName, id, dataOnly = true) {
    try {
      var bucket = await tryFunction(() => openBucket(bucketName))
      var result = await get(bucket, id)
      if (dataOnly && result.value) return result.value
      return result
    } catch (error) { return null }
  },
  async query (bucketName, statement, argsArray) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await query(bucket, statement, argsArray)
    return result
  },
  async createIndex (bucketName, fields) {
    var bucket = await tryFunction(() => openBucket(bucketName))
    var result = await tryFunction(() => createIndex(bucket, fields))
    return result
  },
  openBucket,
  createBucketIfNotExists,
  listBuckets
}

//
// var bucket = cluster.openBucket("hello");
// var bucketMgr = bucket.manager();
//
// var ddocdata = {
//   views: {
//     by_name: {
//       map: [ 'function(doc, meta) {',
//              '  if (doc.type && doc.type == "beer") {',
//              '    emit(doc.name, null);',
//              '  }',
//              '}'
//        ].join('\n')
//      },
//   }
// };
//
// bucketMgr.upsertDesignDocument('ddocname', ddocdata, function(err) {
//   console.log('Insertion of design document completed with error:', err);
// });
