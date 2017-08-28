const path = require('path')
const crypto = require('crypto')
const shallowClone = require('xtend')
const faker = require('faker')
const { TYPE } = require('@tradle/constants')
const { randomElement, iterateImages } = require('./utils')
const nextPhotoId = iterateImages(path.join(__dirname, './photo-ids'))
const nextFace = iterateImages(path.join(__dirname, './lfw-data-uris'))

const YEAR_MILLIS = 365 * 24 * 3600 * 1000
// const currencies = require('@tradle/models')
//   .models['tradle.Money']
//   .properties.currency.oneOf

// const authors = new Array(100).fill(0).map(hash)

const timestamp = (function () {
  // copies data.x from built in faker.js date fakers
  const types = {}
  Object.keys(faker.date).forEach(type => {
    types[type] = (...args) => faker.date[type](...args).getTime()
  })

  return types
}())

const fakers = {
  sig: () => crypto.randomBytes(128).toString('base64'),
  hash,
  true: () => true,
  // author: () => randomElement(authors)
  ref,
  tradleModelId: id => id,
  sigPubKey: () => crypto.randomBytes(32).toString('hex'),
  _virtual: () => ['_link', '_permalink', '_author'],
  timestamp,
  ssn,
  face,
  wealthevent,
  phone: {
    phoneType: () => randomElement(phoneTypes)
  },
  randomLetter: () => randomElement(alphabet),
  currency: () => randomElement(currencies),
  year: {
    past: () => {
      let year = new Date().getFullYear()
      while (Math.random() < 0.5 && year > 1960) {
        year--
      }

      return year
    }
  },
  scan: {
    photoId
  }
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWZYZ'
const currencies = '$€£'
const phoneTypes = ['mobile', 'work', 'home']

function wealthevent () {
  const genEvent = randomElement([
    boughtStock,
    soldStock,
    boughtRealEstate,
    soldRealEstate,
    inheritance
  ])

  return genEvent()
}

function money () {
  const amount = 100000 + Math.random() * 1000000 | 0
  return `${fakers.currency()}${amount}`
}

function inheritance () {
  return `inherited ${money()}`
}

function boughtRealEstate () {
  return `bought a house for ${money()}`
}

function soldRealEstate () {
  return `sold a house for ${money()}`
}

function boughtStock () {
  return `bought ${movedStock()}`
}

function soldStock () {
  return `sold ${movedStock()}`
}

function movedStock () {
  const shares = Math.random() * 1000000 | 0
  return `${shares} shares of ${faker.company.companyName()}`
}

function face () {
  const url = nextFace()
  return { url }
}

function photoId () {
  const url = nextPhotoId()
  return { url }
}

function ssn () {
  const area = faker.random.number({ min: 100, max: 665 })
  const group = faker.random.number({ min: 10, max: 99 })
  const serial = faker.random.number({ min: 1000, max: 9900 })
  return `${area}-${group}-${serial}`
}

function hash () {
  return crypto.randomBytes(32).toString('hex')
}

function ref (type, property) {
  const link = hash()
  if (property.type === 'object') {
    return {
      id: `${type}_${link}_${link}`
    }
  }

  if (property.type !== 'array') {
    throw new Error('expected property type "object" or "array"')
  }

  const objProp = shallowClone(property, {
    type: 'object'
  })

  return new Array(1 + randomInt(4)).fill(0).map(() => {
    return ref(type, objProp)
  })
}

function randomInt (n) {
  return Math.floor(Math.random() * n)
}

module.exports = fakers
