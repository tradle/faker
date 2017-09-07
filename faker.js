const crypto = require('crypto')
const extend = require('xtend/mutable')
const omit = require('object.omit')
const dotProp = require('dot-prop')
const faker = require('faker')
const tradleUtils  = require('@tradle/engine').utils
const buildResource = require('@tradle/build-resource')
const {
  isInlinedProperty,
  getRef,
  isInstantiable
} = require('@tradle/validate-resource').utils
const { TYPE, SIG, PREVLINK, PERMALINK } = require('@tradle/constants')
const BaseObjectModel = require('@tradle/models').models['tradle.Object']
const { randomElement } = require('./utils')

module.exports = fakeResource

function fakeResource ({ models, model, exclude=[] }) {
  const type = model.id
  const value = {}
  if (type) value[TYPE] = type

  const { properties } = model
  const props = Object.keys(properties)
    .filter(propertyName => {
      if (propertyName in value || exclude.includes(propertyName)) {
        return
      }

      if (propertyName === PREVLINK || propertyName === PERMALINK) {
        return
      }

      const property = properties[propertyName]
      if (property.displaysAs) return
      if (property.type === 'array') {
        if (isInlinedProperty({ property, models })) {
          return true
        }

        if (property.items && property.items.backlink) {
          return false
        }

        const ref = getRef(property)
        const refModel = models[ref]
        return !refModel || isInstantiable(refModel)
      }

      return true
    })

  let sideEffects = []
  props.forEach(propertyName => {
    if (propertyName === '_virtual') return

    const property = properties[propertyName]
    const result = fakeValue({
      models,
      model,
      propertyName
    })

    value[propertyName] = result.value
    if (property.virtual) {
      buildResource.setVirtual(value, {
        [propertyName]: result.value
      })
    }

    if (property.type === 'object' || property.type === 'array') {
      sideEffects = sideEffects.concat(result.sideEffects || [])
    }
  })

  if (value[SIG]) {
    value._link = tradleUtils.hexLink(buildResource.omitVirtual(value))
    value._permalink = value._link
  }

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
    if (propertyName[0] === '_') return

    const result = fakeValue({ models, model, propertyName })
    value[propertyName] = result.value
    if (result.sideEffects) {
      sideEffects = sideEffects.concat(result.sideEffects)
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
  if (prop.sample) {
    if (typeof prop.sample === 'object') {
      const fType = firstProp(prop.sample)
      const args = prop.sample[fType]
      value = dotProp.get(faker, fType).apply(null, args)
    } else {
      const gen = dotProp.get(faker, prop.sample)
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
        value = randomElement(property.oneOf)
        break
      case 'object':
        if (!canFakeObjectValue(range)) {
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
        if (!canFakeObjectValue(range)) {
          value = []
          break
        }

        if (range.inlined) {
          value = [
            newFakeData({ models, model: range }).value
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
    } else {
      const link = randomString()
      value = {
        id: `${modelId}_${link}_${link}`,
        title: `${modelId} fake title`
      }
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

function canFakeObjectValue (model) {
  if (!model) return false
  if (model.subClassOf === 'tradle.Enum') return true

  return isInstantiable(model)
}
