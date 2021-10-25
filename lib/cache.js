const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
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
    this.save('mono_default', monoDefault, 0)

    const placeholder = new PNG({ width: 1, height: 1 })
    this.save('placeholder', PNG.sync.write(placeholder), 0)

    const blendWhite = new mapnik.Image(16, 16)
    blendWhite.fillSync(new mapnik.Color(255, 255, 255, 255, true))
    this.save('blend_white', blendWhite, 0)

    const blendBlack = new mapnik.Image(16, 16)
    blendBlack.fillSync(new mapnik.Color(0, 0, 0, 255, true))
    this.save('blend_black', blendBlack, 0)
  }

  save (block, data) {
    this[_cache][JSON.stringify({ block })] = data
  }

  get (block) {
    return this[_cache][JSON.stringify({ block })]
  }

  async loadTexture (block, x, y, z, blockY) {
    // no need to save name and block we can just serialize the block
    if (!this.get(block, blockY)) {
      const name = block.name.slice(10)
      // log.debug('new texture %o', block)
      // Does the texture have multiple faces?
      if (!blockTable[name]) {
        log.error(`No texture for ${name}`)
        this.save(block, this.get('placeholder'), 0)
        return
      }
      // The default texture name for lookup
      let file
      let texture = blockTable[name].textures
      if (block.states && block.states[`${name}_type`]) {
        // First see if we have a state, that shortcuts us directly to a texture
        const type = block.states[`${name}_type`] // i.e. granite_smooth
        // normal grass or double_plant type grass
        if (type !== 'normal' && type !== 'grass') {
          // we already know our file now
          if (type === name) {
            // stone type stone
            file = path.resolve('resourcepacktemplate', `textures/blocks/${name}`)
          } else {
            file = path.resolve('resourcepacktemplate', `textures/blocks/${name}_${type}`)
          }
        }
      }

      // If we didn't shortcut directly to a file we have to figure it out
      if (!file) {
        // Does the texture have an extra key for an "up"-texture (obviously looks better for top-down renders)
        if (typeof texture === 'object' && texture.up) {
          texture = texture.up
        }

        // Is the file in the patch lookup-table (e.g. for water and lava)
        if (patchTable[texture] && patchTable[texture].textures[block.name]) {
          file = path.resolve('resourcepacktemplate', patchTable[texture].textures[block.name])
          log.debug(`Patching texture block: ${name} (${block.name}), texture: ${texture}, file: ${path.basename(file)}`)
        } else {
          // No? Then search for the texture in the block lookup-table

          // Get the correct "state" and path of the texture
          // Is the texture missing?
          if (!textureTable.texture_data[texture].textures) {
            log.error(`Texture not in table: ${texture} %o`, block)
            this.save(block.name, this.get('placeholder'), 0)
          } else {
            // Get the texture of its current state

            const arr = textureTable.texture_data[texture].textures
            if (Array.isArray(arr)) {
              if (arr[0].path) {
                file = path.resolve('resourcepacktemplate', arr[0].path)
              } else {
                file = path.resolve('resourcepacktemplate', arr[0])
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
      }
      // log.debug(`${block.name} getting file ${file}`)

      let imageBuffer
      if (await fs.exists(path.normalize(`${file}.png`))) {
        // PNG
        imageBuffer = await fs.readFile(`${file}.png`)
      } else {
        // TGA Loading
        try {
          const fileData = await fs.readFile(`${file}.tga`)
          imageBuffer = await tga2png(fileData)
        } catch (err) {
          log.error(`Failed to load TGA for ${name} ${block.name}`)
          log.error('texture', texture)
          log.error('block', block)
          log.error(err)
          imageBuffer = this.get('placeholder', 0)
        }
      }

      if (monoTable[texture]) {
        // TODO biome can affect this color
        const img = promisify(new mapnik.Image.fromBytesSync(imageBuffer)) // eslint-disable-line new-cap
        await img.premultiply()
        imageBuffer = await img.composite(this.get('mono_default', 0), {
          comp_op: mapnik.compositeOp.multiply
        })
        imageBuffer = promisify(imageBuffer)
      }

      if (block.name !== 'minecraft:water') {
        if (renderMode === 'topdown_shaded') {
      //     // Convert from buffer if not already
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
          // TODO For now set opacity to 0, this whole blending thing doesn't
          // work but removing it throws an exception I will debug later
          // Update: it doesn't work cause I reversed the logic with regards to blockY?
          imageBuffer = await imageBuffer.composite(blendImg, {
            comp_op: mapnik.compositeOp.overlay, // comp_mode,
            opacity: 0
          })
        }
      }
      this.save(block, imageBuffer, blockY)
    }
    return this.get(block, blockY)
  }
}
