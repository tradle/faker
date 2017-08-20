
const debug = require('debug')(require('./package.json').name)
const crypto = require('crypto')
const traverse = require('traverse')
const faker = require('faker')
const uniq = require('uniq')
const typeforce = require('typeforce')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const deepExtend = require('deep-extend')
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
const VERIFICATION = 'tradle.Verification'

defaultExtension(faker)

module.exports = Samples

function Samples (opts) {
  if (!(this instanceof Samples)) {
    return new Samples(opts)
  }

  let {
    organization=crypto.randomBytes(32).toString('hex'),
    models={},
    products
  } = opts

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

Samples.prototype.one = function ({ model, author, profile, exclude }) {
  const { models } = this
  if (typeof model === 'string') {
    model = models[model]
  }

  const sample = createFake({ models, model, exclude })
  const resource = sample.value
  const props = {}
  if (author) props._author = author

  fixVirtual({
    models,
    model,
    resource,
    props
  })

  if (profile) {
    const _authorTitle = `${profile.firstName} ${profile.lastName}`
    fixName({ resource, profile })
    setVirtual(resource, { _authorTitle })
  }

  validateResource({ models, model, resource })
  return sample
}

Samples.prototype.application = function ({ author, profile, product }) {
  const { models } = this
  const productModel = models[product]
  const forms = productModel.forms.concat(productModel.additionalForms || [])
  const app = this.one({
    model: models['tradle.ProductApplication'],
    author,
    profile
  })

  app.value.product = product

  const formRequests = forms.map(form => {
    const req = this.one({
      model: models['tradle.FormRequest'],
      author: this.organization,
      exclude: ['prefill']
    })

    req.value.product = product
    req.value.form = form
    return req
  })

  const formResources = forms.map(form => {
    const model = models[form]
    return this.one({ model, author, profile })
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
    .concat(formRequests)
    .concat(formResources)
    .concat(submitted)
    .concat(judgement)
    .reduce((all, sample) => {
      // console.log(sample.sideEffects.map(s => s[TYPE]))
      return all.concat(sample.value)
        // .concat(sample.sideEffects || [])
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
  const model = models[VERIFICATION]
  const verification = this.one({
    model: models['tradle.Object']
  }).value

  const more = this._verification({ forResource })
  extend(verification, more)

  fixVirtual({
    models,
    model,
    resource: verification,
    props: { _author: this.organization }
  })

  return verification
}

Samples.prototype._verification = function ({ forResource }) {
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
  let {
    products=getProducts(this.models),
    author=customFakers.hash()
  } = opts

  const { models } = this
  let samples = []
  products = products.slice()
  const profile = {
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName()
  }

  for (let i = 0; i < Math.min(3, products.length); i++) {
    let product = randomElement(products)
    samples = samples.concat(this.application({ author, product, profile }))
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
    properties._t.sample = {
      tradleModelId: [id]
    }
  }

  model.required = uniq(model.required)
  deleteProperties(model, ['_cut', '_n', '_q'])

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
    if (!ref) return // console.log('locally defined', id, name)

    if (!isInlinedProperty({ property, models })) {
      property.sample = {
        ref: [ref, clone(property)]
      }
    }
  })

  traverse(properties).forEach(function (val) {
    if (this.path[this.path.length - 1] === 'type' && val === 'date')  {
      this.parent.update(shallowClone(this.parent.node, {
        type: 'date',
        faker: 'timestamp.recent'
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
  deepExtend(faker, customFakers)
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
          return Object.keys(formProps).some(prop => formProps[prop].sample)
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

function fixVirtual ({ models, model, resource, props={} }) {
  const { _link } = resource
  const _displayName = buildResource.title({
    models,
    model,
    resource
  }) || model.title

  const virtual = extend({
    _link,
    _permalink: _link,
    _displayName
  }, props)

  setVirtual(resource, virtual)
  return resource
}

function fixName ({ resource, profile }) {
  const { firstName, lastName } = profile
  switch (resource[TYPE]) {
  case 'tradle.Name':
  case 'tradle.Visa':
  case 'tradle.Passport':
  case 'tradle.PassportVerification':
  case 'tradle.OnfidoApplicant':
    resource.givenName = firstName
    resource.surname = lastName
    break
  case 'tradle.BasicContactInfo':
  case 'tradle.PersonalInfo':
  case 'tradle.ApplicationForEResidency':
  case 'tradle.ApplicantInfo':
  case 'tradle.CustomerEntity':
  case 'tradle.IndividualOwners':
  case 'tradle.KeyStaff':
  case 'tradle.MyEmployeePass':
  case 'tradle.PhoneBill':
  case 'tradle.BetaTesterContactInfo':
  case 'tradle.UtilityBillVerification':
    resource.firstName = firstName
    resource.lastName = lastName
    break
  }
}
