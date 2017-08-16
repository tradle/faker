const crypto = require('crypto')
const shallowClone = require('xtend')
// const currencies = require('@tradle/models')
//   .models['tradle.Money']
//   .properties.currency.oneOf

// const authors = new Array(100).fill(0).map(hash)

module.exports = {
  sig: () => crypto.randomBytes(128).toString('base64'),
  hash,
  // author: () => randomEl(authors)
  ref,
  tradleModelId: id => id,
  sigPubKey: () => crypto.randomBytes(32).toString('hex'),
  currency: () => '€'
}

function hash () {
  return crypto.randomBytes(32).toString('hex')
}

// function randomEl (arr) {
//   const idx = Math.floor(Math.random() * authors.length)
//   return authors[idx]
// }

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
