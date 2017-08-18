const path = require('path')
const fs = require('fs')
const FACE_DIR = './lfw-data-uris'

const nextFace = (function () {
  const faces = fs.readdirSync(FACE_DIR)
    .map(file => path.join(FACE_DIR, file))

  let idx = 0
  return function () {
    const { dataUri } = require(path.resolve(faces[idx]))
    idx++
    if (idx === faces.length) {
      idx = 0
    }

    return dataUri
  }
}())

module.exports = { nextFace }
