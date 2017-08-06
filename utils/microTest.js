// VERSION 0.0.2
var assert = require('assert')
const fs = require('fs')

var stdoutSaved = process.stdout.write
var stderrSaved = process.stderr.write
var stdoutData = []
var stderrData = []

var consoleMute = function (verbose) {
  if(verbose===-1)return false;
  stdoutData = []
  stderrData = []
  process.stdout.write = function (str, encoding, fd) { stdoutData.push(str.replace(/\r?\n|\r/g, '')) }
  process.stderr.write = function (str, encoding, fd) { stderrData.push(str.replace(/\r?\n|\r/g, '')) }
}
var consoleResume = function (verbose) {
  if(verbose===-1)return false;
  process.stdout.write = stdoutSaved
  process.stderr.write = stderrSaved
}

module.exports = function getTest (name, testVerbose) {
  var testNumber = 0
  var testData = {name, verbose: testVerbose, subtests: []}
  var errors = 0
  var success = 0
  var skipped = 0
  var maxErrors = 1
  var startFunc = function () {
    consoleResume(testData.verbose)
    console.info()
    console.info(`------------------------START----------------------------`)
    console.info(`${name}`)
    console.info(`----------------------------------------------------------------`)
    console.info()
  }
  // consoleMute()
  return {
    test: function (actual, expected, message = 'test', comparation = (a, e) => a, verbose = testVerbose) {
      if (testNumber === 0) startFunc()
      testNumber++
      consoleResume(verbose)
      try {
        if (errors < maxErrors) {
          // if (JSONcomparation(actual, expected) !== expected) throw new Error(message)
          assert.deepEqual(comparation(actual, expected), expected, 'deepEqual')

          success++
          console.info(`- ${testNumber} SUCCESS ${message}`)
          if (verbose)console.info(JSON.stringify(actual, null, 4))
          if (verbose > 1) {
            console.info()
            console.info('  CONSOLE LOGS  ')
            console.info(stdoutData.join('\n\n'))
          }
          testData.subtests.push({count: testNumber, success: message, stdout: stdoutData.join('\n\n'), stderr: stderrData.join('\n\n')})
        } else {
          if (skipped === 0) {
            console.info()
            console.info(`---> SKIPPING (errors > ${maxErrors})`)
          }
          skipped++
          testData.subtests.push({count: testNumber, skipped: true, stdout: stdoutData.join('\n\n'), stderr: stderrData.join('\n\n')})
        }
      } catch (error) {
        errors++
        console.info(`x ${testNumber} ERROR ${message}`)
        console.info(JSON.stringify(actual, null, 4))
        console.info({comparation: comparation(actual, expected), expected})
        console.info()
        console.info('  CONSOLE ERRORS  ')
        console.info(stderrData.join('\n\n'))
        console.info()
        console.info('  CONSOLE LOGS  ')
        console.info(stdoutData.join('\n\n'))
        testData.subtests.push({count: testNumber, comparation: comparation(actual, expected), expected: expected, error: message, stdout: stdoutData.join('\n\n'), stderr: stderrData.join('\n\n')})
      }
      consoleMute(verbose)
    },
    start: startFunc,
    finish: function () {
      consoleResume()
      console.info()
      console.info(`------------------------RESULTS----------------------------`)
      console.info(`NAME: ${name}`)
      console.info(`SKIPPED: ${skipped}`)
      console.info(`----------------------------------------------------------------`)
      testData.total = testNumber
      testData.success = success
      testData.errors = errors
      testData.skipped = skipped
      return testData
    }
  }
}
