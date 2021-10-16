const _keys = Symbol('keys')
const _paletteSize = Symbol('paletteSize')

module.exports = class PalettePersistance {
  constructor (s) {
    this[_keys] = []
    this[_paletteSize] = s
  }

  put (id, name) {
    this[_keys][id] = name
  }

  get (id) {
    return this[_keys][id]
  }

  get size () {
    return this[_paletteSize]
  }
}
