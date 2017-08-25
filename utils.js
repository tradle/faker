const extend = require('xtend/mutable')
const uniq = require('uniq')
const shallowClone = require('xtend')
const deepExtend = require('deep-extend')
const clone = require('clone')
const pick = require('object.pick')
const shuffle = require('array-shuffle')
const traverse = require('traverse')
const baseModels = require('@tradle/models').models
const { TYPE } = require('@tradle/constants')
const BaseObjectModel = baseModels['tradle.Object']

module.exports = {
  extend,
  uniq,
  shallowClone,
  deepExtend,
  clone,
  pick,
  shuffle,
  traverse,
  randomElement,
  normalizeModel,
  getRequired,
  getProperties,
  deleteProperties,
}

function randomElement (arr) {
  return arr[arr.length * Math.random() | 0]
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
  if (model.id !== 'tradle.Message') {
    deleteProperties(model, ['from', 'to'])
  }

  deleteProperties(model, ['_cut', '_n', '_q'])
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
