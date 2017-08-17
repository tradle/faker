const crypto = require('crypto')
const shallowClone = require('xtend')
const buildResource = require('@tradle/build-resource')
const { setVirtual } = buildResource
const { TYPE, SIG } = require('@tradle/constants')
const onfidoSample = require('./onfido-verification')
const visualSample = require('./visual-verification')
const blinkIDSample = require('./blinkid-verification')
const YEAR_MILLIS = 365 * 24 * 3600 * 1000
const VERIFICATION = 'tradle.Verification'

module.exports = {
  onfido: createOnfidoVerification,
  blinkID: createBlinkIDVerification,
  visual: createVisualVerification,
  regular: createBaseVerification
}

function createOnfidoVerification ({ models, forResource, author }) {
  if (forResource[TYPE] !== 'tradle.PhotoID') {
    throw new Error('can only verify tradle.PhotoID')
  }

  let confidence = 0.7 + (Math.random() * 0.3)
  // 2 sig figs
  confidence = Math.floor(100 * confidence) / 100
  return shallowClone(
    onfidoSample,
    createBaseVerification({ models, forResource, author }),
    { confidence }
  )
}

function createVisualVerification ({ models, forResource, author }) {
  if (forResource[TYPE] !== 'tradle.PhotoID') {
    throw new Error('can only verify tradle.PhotoID')
  }

  return shallowClone(
    visualSample,
    createBaseVerification({ models, forResource, author })
  )
}

function createBlinkIDVerification ({ models, forResource, author }) {
  if (forResource[TYPE] !== 'tradle.PhotoID') {
    throw new Error('can only verify tradle.PhotoID')
  }

  return shallowClone(
    blinkIDSample,
    createBaseVerification({ models, forResource, author })
  )
}

function createBaseVerification ({ models, forResource, author }) {
  const document = buildResource.stub({
    models,
    resource: forResource,
    validate: false
  })

  const verification = {
    [TYPE]: VERIFICATION,
    [SIG]: crypto.randomBytes(128).toString('base64'),
    document,
    dateVerified: Date.now() - Math.floor(10 * Math.random()) * YEAR_MILLIS
  }

  const link = crypto.randomBytes(32).toString('hex')
  setVirtual(verification, {
    _link: link,
    _permalink: link,
    _author: author
  })

  return verification
}
