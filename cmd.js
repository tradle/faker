#!/usr/bin/env

const fs = require('fs')
const path = require('path')
const clone = require('clone')
const faker = require('faker')
const jsf = require('json-schema-faker')
const typeforce = require('typeforce')
const traverse = require('traverse')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const mergeModels = require('@tradle/merge-models')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')
const customFakers = require('./fakers')
const BaseObjectModel = baseModels['tradle.Object']
const schemas = {}
const conf = require(path.resolve(process.argv[2]))

run(conf)

function run (conf) {
  typeforce({
    output: typeforce.String,
    types: typeforce.Object,
    extension: typeforce.maybe('String'),
    models: typeforce.maybe(typeforce.oneOf('String', 'Object', 'Array')),
  }, conf)

  console.log('using conf:\n', prettify(conf))
  if (typeof conf.models === 'string') {
    conf.models = require(path.resolve(conf.models))
  }

  jsf.extend('faker', function () {
    const faker = require('faker')
    defaultExtension(faker)
    if (conf.extension) {
      const extension = require(path.resolve(conf.extension))
      extension(faker)
    }

    return faker
  })

  const samples = genSamples(conf)
  fs.writeFileSync(path.resolve(conf.output), prettify(samples))
}

function genSamples (conf) {
  const models = mergeModels()
    .add(baseModels)
    .add(customModels)
    .add(conf.models || [])
    .get()

  for (let id in models) {
    models[id] = normalizeModel(models[id])
  }

  const { types } = conf
  const samples = []
  for (let id in types) {
    let model = models[id]
    if (!model) throw new Error(`model ${id} not found`)

    let n = types[id]
    while (n--) {
      let sample = genSample({ models, model })
      samples.push(sample)
    }
  }

  return samples
}

function genSample ({ models, model }) {
  const sample = jsf(toJSONSchema({ models, model }))
  sample._t = model.id
  sample._permalink = sample._link
  const { properties } = model

  const virtual = {}
  for (let name in sample) {
    let prop = properties[name]
    if (!prop || prop.virtual) {
      virtual[name] = sample[name]
    }
  }

  sample._virtual = Object.keys(virtual)
  return sample
}

function toJSONSchema ({ model, models }) {
  const { id } = model
  if (!schemas[id]) {
    model = clone(model)
    model.type = 'object'
    schemas[id] = model
  }

  return schemas[id]
}

function prettify (obj) {
  return JSON.stringify(obj, null, 2)
}

function normalizeModel (model) {
  model = shallowClone(model, {
    properties: extend(model.properties, BaseObjectModel.properties),
    required: (model.required || []).concat(BaseObjectModel.required).concat([
      '_link',
      '_author'
    ])
  })

  const { properties } = model
  properties._s.faker = 'sig'
  properties._r.faker = 'hash'
  properties._p.faker = 'hash'
  properties._q.faker = 'hash'
  properties._author.faker = 'author'
  properties._link.faker = 'hash'
  properties._permalink.faker = 'hash'

  traverse(model).forEach(function (val) {
    if (this.path[this.path.length - 1] === 'type' && val === 'date')  {
      this.update('string')
    }
  })

  return model
}

function defaultExtension (faker) {
  faker.locale = 'en'
  extend(faker, customFakers)
}

function printUsage () {
  console.log('Usage: tradle-samples ./path/to/conf.js')
  console.log('sample conf:')
  console.log(prettify(require('./sample-conf')))
}

process.on('uncaughtException', function (e) {
  printUsage()
  process.exit(1)
})
