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
  const value = {}
  if (type) value[TYPE] = type

  const { properties } = model
  const props = model.required || Object.keys(properties)
  let sideEffects = []
  props.forEach(propertyName => {
    const property = properties[propertyName]
    const result = fakeValue({
      models,
      model,
      propertyName
    })

    value[propertyName] = result.value
    if (property.type === 'object' || property.type === 'array') {
      if (result.sideEffects) {
        sideEffects = sideEffects.concat(result.sideEffects || [])
      }
    }
  })

  return {
    value,
    sideEffects
  }
}

function newFakeData ({ models, model }) {
  model = typeof model === 'string'
    ? models[model]
    : model

  if (!model) throw new Error('model not found')

  const type = model.id
  const value = {}
  if (type) value[TYPE] = type

  const props = model.required || Object.keys(model.properties)
  let sideEffects = []
  props.forEach(propertyName => {
    if (propertyName[0] !== '_') {
      const result = fakeValue({ models, model, propertyName })
      value[propertyName] = result.value
      if (result.sideEffects) {
        sideEffects = sideEffects.concat(result.sideEffects)
      }
    }
  })

  return {
    value,
    sideEffects
  }
}

function fakeValue ({ models, model, propertyName }) {
  const prop = model.properties[propertyName]
  const ref = prop.ref || (prop.items && prop.items.ref)
  const range = models[ref]
  const { type } = prop

  let value
  let sideEffects
  if (prop.faker) {
    if (typeof prop.faker === 'object') {
      const fType = firstProp(prop.faker)
      const args = prop.faker[fType]
      value = dotProp.get(faker, fType).apply(null, args)
    } else {
      const gen = dotProp.get(faker, prop.faker)
      value = gen()
    }
  } else {
    switch (type) {
      case 'string':
        value = randomString()
        break
      case 'number':
        value = Math.random() * 100 | 0
        break
      case 'date':
        value = Date.now()
        break
      case 'boolean':
        value = Math.random() < 0.5
        break
      case 'enum':
      case 'object':
        if (!ref) {
          value = {}
          break
        }

        if (range.inlined) {
          let inlineResult = newFakeData({ models, model: range })
          value = inlineResult.value
          sideEffects = inlineResult.sideEffects
          break
        }

        let result = fakeResourceStub({
          models,
          model: range
        })

        value = result.value
        sideEffects = result.sideEffects
        break
      case 'array':
        if (!ref) {
          value = []
          break
        }

        if (range.inlined) {
          value = [
            newFakeData({ models, model: range })
          ]

          break
        }

        let stubResult = fakeResourceStub({
          models,
          model: models[ref]
        })

        value = [
          stubResult.value
        ]

        sideEffects = stubResult.sideEffects
        break

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

  return {
    value,
    sideEffects
  }
}

function fakeResourceStub ({ models, model }) {
  const modelId = model.id
  let value
  let sideEffects
  if (modelId === 'tradle.Money') {
    value = {
      // [TYPE]: 'tradle.Money',
      "value": "6000",
      "currency": "€"
    }
  } else if (modelId === 'tradle.Phone') {
    value = {
      // [TYPE]: 'tradle.Phone',
      phoneType: fakeResourceStub({
        models,
        model: models['tradle.PhoneTypes']
      }),
      number: '3456789'
    }
  } else if (model.subClassOf === 'tradle.Enum') {
    if (Array.isArray(model.enum)) {
      const { id, title } = randomElement(model.enum)
      value = {
        id: `${modelId}_${id}`,
        title
      }
    }

    const link = randomString()
    value = {
      id: `${modelId}_${link}_${link}`,
      title: `${modelId} fake title`
    }
  } else {
    const resource = fakeResource({ models, model })
    value = buildResource.stub({
      models,
      model,
      resource: resource.value
    })

    sideEffects = (resource.sideEffects || []).concat(resource.value)
  }

  return {
    value,
    sideEffects
  }
}

function randomString () {
  return crypto.randomBytes(32).toString('hex')
}

function firstProp (obj) {
  for (let key in obj) {
    return key
  }
}
