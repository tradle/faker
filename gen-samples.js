
const debug = require('debug')(require('./package.json').name)
const crypto = require('crypto')
const traverse = require('traverse')
const uniq = require('uniq')
const typeforce = require('typeforce')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const clone = require('clone')
const pick = require('object.pick')
const shuffle = require('array-shuffle')
const validateResource = require('@tradle/validate-resource')
const buildResource = require('@tradle/build-resource')
const { getRef, isInlinedProperty, setVirtual } = validateResource.utils
const mergeModels = require('@tradle/merge-models')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')
const Verifier = require('./verifier')
const createFake = require('./faker')
const customFakers = require('./fakers')
const { randomElement } = require('./utils')
const BaseObjectModel = baseModels['tradle.Object']
const { TYPE } = require('@tradle/constants')

module.exports = Samples

function Samples ({
  organization=crypto.randomBytes(32).toString('hex'),
  models={},
  products
}) {
  this.organization = organization
  this.models = models = mergeModels()
    .add(baseModels)
    .add(customModels)
    .add(models)
    .get()

  this.products = products || getProducts(models)

  debug(`found ${this.products.length} products`)

  for (let id in models) {
    let model = models[id]
    normalizeModel({ models, model })
  }
}

Samples.prototype.one = function ({ model, author }) {
  const { models } = this
  if (typeof model === 'string') {
    model = models[model]
  }

  const sample = createFake({
    models,
    model,
    signed: true
  })

  const { value } = sample
  const virtual = {
    _link: value._link,
    _permalink: value._link,
    _author: author
  }

  setVirtual(value, virtual)
  validateResource({
    models,
    model,
    resource: value
  })

  return sample
}

Samples.prototype.application = function ({ author, product }) {
  const { models } = this
  const productModel = models[product]
  const forms = productModel.forms.concat(productModel.additionalForms || [])
  const app = this.one({
    model: models['tradle.ProductApplication'],
    author
  })

  app.product = product

  const formResources = forms.map(form => {
    const model = models[form]
    return this.one({ model, author })
  })

  const verifications = formResources.map(res => {
    return this.verification({ forResource: res.value })
  })

  const formStubs = formResources.map(res => {
    return buildResource.stub({ models, resource: res.value })
  })

  const submitted = this.one({
    model: models['tradle.ApplicationSubmitted'],
    author: this.organization
  })

  submitted.value.forms = formStubs

  const myProductModel = models[product.replace('.', 'My.')]
  let judgement
  if (Math.random() < 0.5) {
    if (myProductModel) {
      judgement = this.one({
        model: myProductModel,
        author: this.organization
      })
    } else {
      judgement = this.one({
        model: 'tradle.Confirmation',
        author: this.organization
      })
    }
  } else {
    judgement = this.one({
      model: models['tradle.ApplicationDenial'],
      author: this.organization
    })
  }

  judgement.value.forms = formStubs

  const samples = [app]
    .concat(formResources)
    .concat(submitted)
    .concat(judgement)
    .reduce((all, sample) => {
      // console.log(sample.sideEffects.map(s => s[TYPE]))
      return all.concat(sample.value)
        .concat(sample.sideEffects || [])
    }, [])
    .concat(verifications)

  samples.forEach(resource => {
    const model = models[resource[TYPE]]
    validateResource({ models, model, resource })
  })

  return samples
}

Samples.prototype.verification = function ({ forResource }) {
  const { models } = this
  const author = this.organization
  if (forResource[TYPE] === 'tradle.PhotoID') {
    if (Math.random() < 0.5) {
      return Verifier.onfido({ models, forResource, author })
    }

    return Verifier.visual({ models, forResource, author })
  }

  return Verifier.regular({ models, forResource, author })
}

Samples.prototype.user = function (opts={}) {
  const {
    products=getProducts(this.models),
    author=customFakers.hash()
  } = opts

  const { models } = this
  let samples = []

  for (let i = 0; i < Math.min(3, products.length); i++) {
    let product = randomElement(products)
    samples = samples.concat(this.application({ author, product }))
    products.splice(products.indexOf(product), 1)
  }

  return samples
}

function normalizeModel ({ models, model }) {
  const { properties, id, inlined, subClassOf, required=[] } = model
  if (!inlined) {
    extend(
      properties,
      clone(BaseObjectModel.properties)
    )

    model.required = getRequired(model)
    properties._t.faker = {
      tradleModelId: [id]
    }
  }

  model.required = uniq(model.required)
  deleteProperties(model, ['_cut', '_n', '_q'])

  if (!inlined && model.subClassOf !== 'tradle.Enum') {
    properties._s.faker = 'sig'
    properties._r.faker = 'hash'
    properties._p.faker = 'hash'
    properties._z.faker = 'hash'
    properties._link.faker = 'hash'
    properties._permalink.faker = 'hash'
    properties._sigPubKey.faker = 'sigPubKey'
    properties._time.minimum = Date.now() - 60 * 365 * 24 * 60 * 1000
    properties._time.maximum = Date.now() + 60 * 365 * 24 * 60 * 1000
  }

  Object.keys(properties).forEach(name => {
    const property = properties[name]
    if (property.type !== 'object' &&
      property.type !== 'array' &&
      property.type !== 'enum' &&
      property.type !== 'json') {
      return
    }

    if (property.type === 'array' && property.items.type && property.items.type !== 'object') {
      return
    }

    if (property.type === 'enum') {
      property.type = 'object'
    } else if (property.type === 'json') {
      property.type = 'object'
    }

    const ref = getRef(property)
    if (!ref) return console.log('locally defined', id, name)

    if (isInlinedProperty({ property, models })) {
      if (ref === 'tradle.Model') {
        return
      }

      // properties[name] = toJSONSchema({ models, model: models[ref], schemas })
      if (property.type === 'array') {
        properties[name] = {
          type: 'array',
          items: properties[name]
        }
      }
    } else {
      property.faker = {
        ref: [ref, clone(property)]
      }
    }
  })

  traverse(properties).forEach(function (val) {
    if (this.path[this.path.length - 1] === 'type' && val === 'date')  {
      this.parent.update(shallowClone(this.parent.node, {
        type: 'date',
        faker: 'timestamp'
        // faker: 'date.past'
      }))

      // set date value for faker on this prop
    }
  })

  return model
}

function getRequired (model) {
  const { required=[] } = model
  if (model.inlined) return required.concat(TYPE)

  return required
    .concat(BaseObjectModel.required)
    .concat([
      '_link',
      '_permalink',
      '_author'
    ])
}

function getProperties (model) {
  if (model.inlined) {
    return extend(
      clone(model.properties),
      clone(pick(BaseObjectModel.properties, [TYPE]))
    )
  }

  return extend(
    clone(model.properties),
    clone(BaseObjectModel.properties)
  )
}

function deleteProperties (model, properties) {
  properties.forEach(name => {
    delete model.properties[name]
  })

  model.required = model.required.filter(name => !properties.includes(name))
  return model
}

function repeat (n, fn) {
  while (n--) fn()
}

function defaultExtension (faker) {
  faker.locale = 'en'
  extend(faker, customFakers)
}

function getProducts (models) {
  return shuffle(Object.keys(models))
    .filter(id => {
      const { properties, subClassOf, forms } = models[id]
      return id !== 'tradle.Remediation' &&
        subClassOf === 'tradle.FinancialProduct' &&
        forms.length &&
        forms.some(form => {
          const formProps = models[form].properties
          return Object.keys(formProps).some(prop => formProps[prop].faker)
        })
    })
    .sort((a, b) => {
      if (models[a].forms.includes('tradle.Selfie')) {
        return -1
      }

      if (models[b].forms.includes('tradle.Selfie')) {
        return 1
      }

      return 0
    })
}
