const crypto = require('crypto')
const authors = new Array(100).fill(0).map(hash)

module.exports = {
  sig: () => crypto.randomBytes(128).toString('base64'),
  hash,
  author: () => randomEl(authors)
}

function hash () {
  return crypto.randomBytes(32).toString('hex')
}

function randomEl (arr) {
  const idx = Math.floor(Math.random() * authors.length)
  return authors[idx]
}
