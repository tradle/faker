
// const debug = require('debug')(require('./package.json').name)
const crypto = require('crypto')
const traverse = require('traverse')
const uniq = require('uniq')
const jsf = require('json-schema-faker')
const typeforce = require('typeforce')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const clone = require('clone')
const pick = require('object.pick')
const shuffle = require('array-shuffle')
const validateResource = require('@tradle/validate-resource')
const { getRef, isInlinedProperty, setVirtual } = validateResource.utils
const mergeModels = require('@tradle/merge-models')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')
const Verifier = require('./verifier')
const customFakers = require('./fakers')
const BaseObjectModel = baseModels['tradle.Object']
const { TYPE } = require('@tradle/constants')

module.exports = Samples

jsf.extend('faker', function () {
  const faker = require('faker')
  defaultExtension(faker)
  return faker
})

function Samples ({ models={}, products }) {
  this.organization = crypto.randomBytes(32).toString('hex')
  this.models = models = mergeModels()
    .add(baseModels)
    .add(customModels)
    .add(models)
    .get()

  this.products = products || shuffle(Object.keys(models))
    .filter(id => {
      const model = models[id]
      return id !== 'tradle.Remediation' &&
        model.subClassOf === 'tradle.FinancialProduct' &&
        model.forms.length
    })
    .slice(0, 6)

  this.schemas = {}
  for (let id in models) {
    let model = models[id]
    normalizeModel(model)
    this.schemas[id] = toJSONSchema({
      models,
      model,
      schemas: this.schemas
    })
  }
}

Samples.prototype.one = function ({ model, author }) {
  const { schemas, models } = this
  if (typeof model === 'string') {
    model = models[model]
  }

  const sample = jsf(schemas[model.id])
  delete sample._p
  delete sample._r
  if (model.subClassOf === 'tradle.MyProduct' ||
      model.id === 'tradle.Confirmation' ||
      model.id === 'tradle.ApplicationSubmitted' ||
      model.id === 'tradle.ApplicationDenial') {
    delete sample.forms
  }

  // delete sample._virtual

  const virtual = {
    _link: sample._link,
    _permalink: sample._link,
    _author: author
  }

  if (!author) delete virtual.author

  setVirtual(sample, virtual)
  validateResource({
    models,
    model,
    resource: sample
  })

  // const { properties } = model

  // const virtual = {}
  // for (let name in sample) {
  //   let prop = properties[name]
  //   if (!prop || prop.virtual) {
  //     virtual[name] = sample[name]
  //   }
  // }

  // sample._virtual = Object.keys(virtual)
  return sample
}

Samples.prototype.application = function ({ author, product }) {
  const { models } = this
  const productModel = models[product]
  const forms = productModel.forms.concat(productModel.additionalForms || [])
  const samples = []
  const app = this.one({
    model: models['tradle.ProductApplication'],
    author
  })

  app.product = product
  samples.push(app)

  for (let form of forms) {
    const model = models[form]
    const sample = this.one({ model, author })
    samples.push(sample)
    samples.push(this.verification({
      forResource: sample
    }))
  }

  samples.push(this.one({
    model: models['tradle.ApplicationSubmitted'],
    author: this.organization
  }))

  const myProductModel = models[product.replace('.', 'My.')]
  if (Math.random() < 0.5) {
    if (myProductModel) {
      samples.push(this.one({
        model: myProductModel,
        author: this.organization
      }))
    } else {
      samples.push(this.one({
        model: 'tradle.Confirmation',
        author: this.organization
      }))
    }
  } else {
    samples.push(this.one({
      model: models['tradle.ApplicationDenial'],
      author: this.organization
    }))
  }

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

Samples.prototype.user = function ({ author, types }) {
  const { models } = this
  if (!author) author = customFakers.hash()

  let samples = []
  const products = this.products.slice()
  for (let i = 0; i < 3; i++) {
    let product = randomElement(products)
    samples = samples.concat(this.application({ author, product }))
    products.splice(products.indexOf(product), 0)
  }

  return samples

  // const samples = []
  // Object.keys(types).forEach(id => {
  //   let model = models[id]
  //   if (!model) throw new Error(`model ${id} not found`)

  //   repeat(types[id], () => {
  //     const sample = this.one({ model, author })
  //     validateResource({ models, model, resource: sample })
  //     samples.push(sample)
  //   })
  // })

  // return samples
}

function normalizeModel (model) {
  if (!model.inlined) {
    extend(model.properties, BaseObjectModel.properties)
    model.required = (model.required || []).concat(BaseObjectModel.required)
  }

  delete model.properties._virtual
  model.required = uniq(model.required)
  return model
}

function toJSONSchema ({ model, models, schemas }) {
  const { id } = model
  if (!schemas[id]) {
    schemas[id] = _toJSONSchema({ model, models, schemas })
  }

  return clone(schemas[id])
}

function _toJSONSchema ({ model, models, schemas }) {
  const { id } = model
  const required = getRequired(model)
  const schema = schemas[id] = {
    id,
    type: 'object',
    properties: getProperties(model),
    required: uniq(required),
    additionalProperties: false
  }

  const { properties } = schema
  deleteProperties(schema, ['_cut', '_n', '_q', '_virtual'])

  properties._t.faker = {
    tradleModelId: [id]
  }

  if (model.inlined) {
    deleteProperties(schema, [
      '_s',
      '_r',
      '_p',
      '_z',
      '_link',
      '_permalink',
      '_author'
    ])
  }

  if (!model.inlined && model.subClassOf !== 'tradle.Enum') {
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

      properties[name] = toJSONSchema({ models, model: models[ref], schemas })
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

  traverse(schema).forEach(function (val) {
    if (this.path[this.path.length - 1] === 'type' && val === 'date')  {
      this.parent.update(shallowClone(this.parent.node, {
        type: 'string',
        faker: 'date.past'
      }))

      // set date value for faker on this prop
    }
  })

  return schema
}

function getRequired (model) {
  const { required=[] } = model
  if (model.inlined) return required.concat(TYPE)

  return required
    .concat(BaseObjectModel.required)
    .concat([
      '_link',
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

function deleteProperties (schema, properties) {
  properties.forEach(name => {
    delete schema.properties[name]
  })

  schema.required = schema.required.filter(name => !properties.includes(name))
  return schema
}

function repeat (n, fn) {
  while (n--) fn()
}

function defaultExtension (faker) {
  faker.locale = 'en'
  extend(faker, customFakers)
}

function randomElement (arr) {
  return arr[arr.length * Math.random() | 0]
}
