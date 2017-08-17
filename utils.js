
module.exports = {
  randomElement
}

function randomElement (arr) {
  return arr[arr.length * Math.random() | 0]
}
