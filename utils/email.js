const fs = require('fs')
const path = require('path')
const uuid = require('uuid/v4')

const log = (msg, data) => { console.log('\n' + JSON.stringify(['LOG', 'SINT UTILS EMAIL', msg, data])) }
const debug = (msg, data) => { if (process.env.debugCouchbase) console.log('\n' + JSON.stringify(['DEBUG', 'SINT UTILS EMAIL', msg, data])) }
const error = (msg, data) => { console.log('\n' + JSON.stringify(['ERROR', 'SINT UTILS EMAIL', msg, data])) }

const nodemailer = require('nodemailer')
const vm = require('vm')
// const fs = require('fs')

// SMTP
var smtpTrans
//

// debug('smtpTrans createTransport', CONFIG)
const getMailTemplate = async (data) => {
  // var templateInfo = {html: 'html', text: 'text', subject: 'subject'}
  // templateInfo = data.template
  // delete data.template
  // var templatefromDb = await DB.get(data.template)
  // if (templatefromDb)templateInfo = templatefromDb
  debug('getMailTemplate', { data })
  var populate = (content) => vm.runInNewContext('returnVar=`' + content.replace(new RegExp('`', 'g'), '\\`') + '`', data.templateData)
  var result = { from: data.from, to: data.to, html: populate(data.template.html), text: populate(data.template.text), subject: populate(data.template.subject) }
  debug('getMailTemplate', { result })
  return result
}
const sendMail = async (mailData, smtpConfig) => {
  // mailData={from,to,template}
  if (!smtpTrans)smtpTrans = nodemailer.createTransport(smtpConfig)
  var populatedMessage = await getMailTemplate(mailData)
  var returnResult = await new Promise((resolve, reject) => smtpTrans.sendMail(populatedMessage, (err, data) => err ? reject(err) : resolve(data)))
  log('sendMail', { returnResult })
  return returnResult
}

module.exports = {
  sendMail, getMailTemplate
}
