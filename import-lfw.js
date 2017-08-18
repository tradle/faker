const promisify = require('pify')
const fs = promisify(require('fs'))
const path = require('path')
const DataURI = require('data-uri')
const co = require('co')
const mkdirp = require('mkdirp')
const dir = process.argv[2] || './lfw'
const out = process.argv[3] || './lfw-data-uris'

const importPerson = co.wrap(function* (dir) {
  const stat = yield fs.stat(dir)
  if (!(stat["mode"] & 0040000)) {
    return
  }

  const files = yield fs.readdir(dir)
  const photoPath = path.join(dir, files[0])
  return new Promise(resolve => {
    DataURI.encode(photoPath, wrapper => {
      const result = wrapper[photoPath]
      result.path = photoPath
      resolve(result)
    })
  })
})

const loadPeople = co.wrap(function* (dir) {
  const dirs = fs.readdirSync(dir)
  const results = yield dirs.map(function (personDir) {
    return importPerson(path.join(dir, personDir))
  })

  mkdirp.sync(out)
  for (const result of results) {
    if (!result) continue

    if (result.status === 'ERROR') {
      console.warn('failed to load image: ' + result.path)
      continue
    }

    const { dataUri } = result
    const dataUriPath = path.join(
      out,
      path.basename(
        result.path.replace(/\.[a-z0-9]+/, '.json')
      )
    )

    fs.writeFile(dataUriPath, prettify({ dataUri }))
      .catch(console.error)
  }
})

loadPeople(dir).catch(console.error)

function prettify (obj) {
  return JSON.stringify(obj, null, 2)
}
