#!/usr/bin/env

const fs = require('fs')
const path = require('path')
const clone = require('clone')
const faker = require('faker')
const jsf = require('json-schema-faker')
const typeforce = require('typeforce')
const traverse = require('traverse')
const uniq = require('uniq')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const pick = require('object.pick')
const validateResource = require('@tradle/validate-resource')
const { getRef, isInlinedProperty, setVirtual } = validateResource.utils
const mergeModels = require('@tradle/merge-models')
const baseModels = toObject(require('@tradle/models').models)
const customModels = require('@tradle/custom-models')
const customFakers = require('./fakers')
const Gen = require('./')
const BaseObjectModel = baseModels['tradle.Object']
const TYPE = '_t'
const SCHEMAS = {}
const conf = require(path.resolve(process.argv[2]))

run(conf)

function run (conf) {
  typeforce({
    output: typeforce.String,
    users: typeforce.Number,
    types: typeforce.Object,
    extension: typeforce.maybe('String'),
    models: typeforce.maybe(typeforce.oneOf('String', 'Object', 'Array')),
  }, conf)

  console.log('using conf:\n', prettify(conf))
  if (typeof conf.models === 'string') {
    conf.models = require(path.resolve(conf.models))
  }

  if (conf.extension) {
    const extension = require(path.resolve(conf.extension))
    extension(faker)
  }

  // jsf.extend('faker', function () {
  //   const faker = require('faker')
  //   defaultExtension(faker)
  //   if (conf.extension) {
  //     const extension = require(path.resolve(conf.extension))
  //     extension(faker)
  //   }

  //   return faker
  // })

  const gen = new Gen({
    models: conf.models || {}
  })

  const { users, types } = conf
  const samples = new Array(users).fill(0).reduce((samples) => {
    // const next = genSamplesForOneUser({ models, types })
    const next = gen.user({ types })
    return samples.concat(next)
  }, [])

  fs.writeFileSync(path.resolve(conf.output), prettify(samples))
}

function printUsage () {
  console.log('Usage: tradle-samples ./path/to/conf.js')
  console.log('sample conf:')
  console.log(prettify(require('./sample-conf')))
}

function toObject (models) {
  const obj = {}
  for (let model of models) {
    obj[model.id] = model
  }

  return obj
}

function prettify (obj) {
  return JSON.stringify(obj, null, 2)
}

process.on('uncaughtException', function (e) {
  printUsage()
  process.exit(1)
})
