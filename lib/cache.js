const fs = require('fs')
const promisify = require('@gar/promisify')
const mapnik = require('mapnik')
const convert = require('color-convert')
const path = require('path')
const tga2png = require('tga2png')
const log = require('./log')

const { PNG } = require('pngjs')

const blockTable = require('../resourcepacktemplate/blocks.json')
const monoTable = require('../lookup-tables/monochrome-textures-table.json')
const patchTable = require('../lookup-tables/patch-textures-table.json')
const textureTable = require('../resourcepacktemplate/textures/terrain_texture.json')

const renderMode = 'topdown_shaded'

const _cache = Symbol('cache')

module.exports = class Cache {
  constructor () {
    this[_cache] = []

    const monoDefault = new mapnik.Image(16, 16)
    const color = convert.hex.rgb('#79c05a')
    monoDefault.fillSync(new mapnik.Color(color[0], color[1], color[2], 255, true))
    this.save('mono_default', 0, monoDefault)

    const placeholder = new PNG({ width: 1, height: 1 })
    this.save('placeholder', 0, PNG.sync.write(placeholder))

    const blendWhite = new mapnik.Image(16, 16)
    blendWhite.fillSync(new mapnik.Color(255, 255, 255, 255, true))
    this.save('blend_white', 0, blendWhite)

    const blendBlack = new mapnik.Image(16, 16)
    blendBlack.fillSync(new mapnik.Color(0, 0, 0, 255, true))
    this.save('blend_black', 0, blendBlack)
  }

  save (name, value, data, y) {
    this[_cache][JSON.stringify({ name: name, value: value, y: y })] = data
  }

  get (name, value, y) {
    return this[_cache][JSON.stringify({ name: name, value: value, y: y })]
  }

  async loadTexture (name, value, x, y, z, blockY) {
    if (!this.get(name, value, blockY)) {
      // Does the texture have multiple faces?
      if (!blockTable[name.slice(10)]) {
        log.error(`No texture for ${name}`)
        this.save(name, value, this.get('placeholder', 0))
        return
      }
      // The default texture name for lookup
      let texture = blockTable[name.slice(10)].textures
      // Does the texture have an extra key for an "up"-texture (obviously looks better for top-down renders)
      if (texture.up) {
        texture = texture.up
      }

      let file
      // Is the file in the patch lookup-table (e.g. for water and lava)
      if (patchTable[texture] && patchTable[texture].textures[value]) {
        file = path.resolve('resourcepacktemplate', patchTable[texture].textures[value])
        log.debug(`Patching texture block: ${name}, value: ${value}, texture: ${texture}, file: ${path.basename(file)}`)
      } else {
        // No? Then search for the texture in the block lookup-table

        // Get the correct "state" and path of the texture
        // Is the texture missing?
        if (!textureTable.texture_data[texture].textures[value]) {
          log.error(`Value not matching: ${texture} (${name} ${value})`)
          this.save(name, value, this.get('placeholder', 0))
        } else {
          // Get the texture of its current state

          const arr = textureTable.texture_data[texture].textures
          if (Array.isArray(arr)) {
            if (arr[value].path) {
              file = path.resolve('resourcepacktemplate', arr[value].path)
            } else {
              file = path.resolve('resourcepacktemplate', arr[value])
            }
          } else {
            if (arr.path) {
              file = path.resolve('resourcepacktemplate', arr.path)
            } else {
              file = path.resolve('resourcepacktemplate', arr)
            }
          }
        }
      }

      let imageBuffer
      if (fs.existsSync(path.normalize(`${file}.png`))) {
        // PNG
        imageBuffer = fs.readFileSync(`${file}.png`)
      } else {
        // TGA Loading
        imageBuffer = await tga2png(fs.readFileSync(file + '.tga'))
          .catch((err) => {
            log.error(`Failed to load TGA for ${name} ${value} ${texture}`)
            log.error('Error when loading TGA')
            log.error(err)
            return this.get('placeholder', 0)
          })
      }

      // Blend monochrome textures with colour and save to cache
      if (monoTable[texture]) {
        const img = promisify(new mapnik.Image.fromBytesSync(imageBuffer)) // eslint-disable-line new-cap
        await img.premultiply()
        imageBuffer = await img.composite(this.get('mono_default', 0), {
          comp_op: mapnik.compositeOp.multiply
        })
        imageBuffer = promisify(imageBuffer)
      }

      if (name !== 'minecraft:water') {
        if (renderMode === 'topdown_shaded') {
          // Convert from buffer if not already
          if (imageBuffer.scaling === undefined) {
            imageBuffer = promisify(mapnik.Image.fromBytesSync(imageBuffer))
          }
          await imageBuffer.premultiply()

          let opac = 0
          let blendImg

          if (blockY < 64) {
            blendImg = this.get('blend_black', 0)
            opac = (64 - blockY) / (blockY * 64)
          } else {
            blendImg = this.get('blend_white', 0)
            opac = (-64 + blockY) / (blockY)
          }

          if (opac > 1) {
            opac = 1
          }
          if (opac < 0) {
            opac = 0
          }
          imageBuffer = await imageBuffer.composite(blendImg, {
            comp_op: mapnik.compositeOp.overlay, // comp_mode,
            opacity: opac
          })
        }
      }
      this.save(name, value, imageBuffer, blockY)
    }
    return this.get(name, value, blockY)
  }
}
