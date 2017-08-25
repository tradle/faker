
const debug = require('debug')(require('./package.json').name)
const crypto = require('crypto')
const faker = require('faker')
const typeforce = require('typeforce')
const validateResource = require('@tradle/validate-resource')
const buildResource = require('@tradle/build-resource')
const { getRef, isInlinedProperty, setVirtual } = validateResource.utils
const mergeModels = require('@tradle/merge-models')
const baseModels = require('@tradle/models').models
const customModels = require('@tradle/custom-models')
const Verifier = require('./verifier')
const createFake = require('./faker')
const customFakers = require('./fakers')
const {
  extend,
  uniq,
  shallowClone,
  deepExtend,
  clone,
  pick,
  shuffle,
  randomElement,
  normalizeModel,
  getRequired,
  getProperties,
  deleteProperties,
} = require('./utils')
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
  models = mergeModels()
    .add(baseModels)
    .add(customModels)
    .add(models)
    .get()

  this.models = models = clone(models)

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
  const { value, sideEffects=[] } = sample
  const resource = value
  const props = {}
  if (author) props._author = author

  sideEffects.concat(resource)
    .forEach(resource => {
      fixVirtual({ models, resource, props })
      if (profile) {
        const _authorTitle = `${profile.firstName} ${profile.lastName}`
        fixName({ resource, profile })
        setVirtual(resource, { _authorTitle })
      }

      validateResource({ models, resource })
    })

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
      return all
        .concat(sample.sideEffects || [])
        .concat(sample.value)
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
  // products = products.slice()
  const profile = {
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName()
  }

  products.forEach(product => {
    samples = samples.concat(this.application({ author, product, profile }))
  })

  // for (let i = 0; i < Math.min(3, products.length); i++) {
  //   let product = randomElement(products)
  //   samples = samples.concat(this.application({ author, product, profile }))
  //   products.splice(products.indexOf(product), 1)
  // }

  return samples
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
  if (!model) model = models[resource[TYPE]]

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
  default:
    break
  }
}
