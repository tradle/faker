// see https://github.com/json-schema-faker/json-schema-faker#extending-dependencies

module.exports = function fakerExtension (faker) {
  faker.locale = 'en'
  faker.ooga = function () {
    return 'booga'
  }
}
