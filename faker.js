const crypto = require('crypto')
const extend = require('xtend/mutable')
const dotProp = require('dot-prop')
const faker = require('faker')
const buildResource = require('@tradle/build-resource')
const fakers = require('./fakers')
const { randomElement } = require('./utils')

extend(faker, fakers)

const { TYPE, SIG } = require('@tradle/constants')

module.exports = fakeResource

function fakeResource ({ models, model }) {
  const type = model.id
  const data = {}
  if (type) data[TYPE] = type

  const props = model.required || Object.keys(model.properties)
  props.forEach(propertyName => {
    data[propertyName] = fakeValue({
      models,
      model,
      propertyName
    })
  })

  return data
}

function newFakeData ({ models, model }) {
  model = typeof model === 'string'
    ? models[model]
    : model

  if (!model) throw new Error('model not found')

  const type = model.id
  const data = {}
  if (type) data[TYPE] = type

  const props = model.required || Object.keys(model.properties)
  props.forEach(propertyName => {
    if (propertyName.charAt(0) === '_' || propertyName === 'from' || propertyName === 'to') return

    data[propertyName] = fakeValue({ models, model, propertyName })
  })

  return data
}

function fakeValue ({ models, model, propertyName }) {
  const prop = model.properties[propertyName]
  const ref = prop.ref || (prop.items && prop.items.ref)
  const range = models[ref]
  const { type } = prop

  if (prop.faker && (type !== 'object' && type !== 'array')) {
    if (typeof prop.faker === 'object') {
      const fType = firstProp(prop.faker)
      const args = prop.faker[fType]
      return dotProp.get(faker, fType).apply(null, args)
    }

    const gen = dotProp.get(faker, prop.faker)
    return gen()
  }

  switch (type) {
    case 'string':
      return randomString()
    case 'number':
      return Math.random() * 100 | 0
    case 'date':
      return Date.now()
    case 'enum':
    case 'object':
      if (!ref) return {}

      if (range.inlined) {
        return newFakeData({ models, model: range })
      }

      return fakeResourceStub({
        models,
        model: range
      })
    case 'boolean':
      return Math.random() < 0.5
    case 'array':
      if (!ref) return []

      if (range.inlined) {
        return [
          newFakeData({ models, model: range })
        ]
      }

      return [
        fakeResourceStub({
          models,
          model: models[ref]
        })
      ]
      // const resource = fakeValue({ models, model })
      // let value
      // if (ref && !prop.inlined) {
      //   value = buildId({ model, resource })
      // } else {
      //   value = resource
      // }

      // return [value]
    default:
      throw new Error(`unknown property type: ${type} for property ${propertyName}`)
  }
}

function fakeResourceStub ({ models, model }) {
  const modelId = model.id
  if (modelId === 'tradle.Money') {
    return {
      // [TYPE]: 'tradle.Money',
      "value": "6000",
      "currency": "€"
    }
  }

  if (modelId === 'tradle.Phone') {
    return {
      // [TYPE]: 'tradle.Phone',
      phoneType: fakeResourceStub({
        models,
        model: models['tradle.PhoneTypes']
      }),
      number: '3456789'
    }
  }

  if (model.subClassOf === 'tradle.Enum') {
    if (Array.isArray(model.enum)) {
      const { id, title } = randomElement(model.enum)
      return {
        id: `${modelId}_${id}`,
        title
      }
    }

    const link = randomString()
    return {
      id: `${modelId}_${link}_${link}`,
      title: `${modelId} fake title`
    }
  }

  const resource = fakeResource({ models, model })
  return buildResource.stub({
    models,
    model,
    resource
  })
}

function randomString () {
  return crypto.randomBytes(32).toString('hex')
}

function firstProp (obj) {
  for (let key in obj) {
    return key
  }
}
