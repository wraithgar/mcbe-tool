'use strict'

const Vec3 = require('vec3')
const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
const mapnik = promisify(require('mapnik'))
const path = require('path')

const transparentBlocks = require('../lookup-tables/transparent-blocks-table.json')
const PalettePersistance = require('./palette-persistance.js')
const nbtParse = require('./nbt-parse.js')
// https://gist.github.com/Tomcc/ad971552b024c7619e664d0377e48f58
const runtimeIDTable = require('../lookup-tables/runtimeid-table.json')

const Cache = require('./cache')
const log = require('./log')

const renderMode = 'topdown_shaded'

const _blocks = Symbol('blocks')
const _y = Symbol('Y')
const _yThreshold = Symbol('yThreshold')
const _cache = Symbol('cache')
const _key = Symbol('key')

function getData (dataArray, pos) {
  const slot = pos >> 1
  const part = pos & 1

  if (part === 0) {
    return (dataArray[slot]) & 0xf
  }
  return (dataArray[slot] >> 4) & 0xf
}

// TODO currently only ever gets key length 10 but could handle others
module.exports = class Chunk {
  // Key is just the coords part of the key
  constructor (key, yThreshold) {
    this[_blocks] = {}
    this[_key] = Buffer.from(key, 'hex')
    this[_y] = 1
    this[_yThreshold] = yThreshold
    this[_cache] = new Cache()
  }

  get coords () {
    return this[_key].toString('hex')
  }

  get key () {
    return this[_key]
  }

  get X () {
    return this[_key].readInt32LE(0)
  }

  get Z () {
    return this[_key].readInt32LE(4)
  }

  get height () {
    return this[_y]
  }

  set height (h) {
    this[_y] = h
  }

  // This should be called in increasing y order
  setBlock (x, y, z, name, value) {
    if (y < this[_yThreshold]) {
      let ceiling = 1
      while (this[_blocks][new Vec3(x, ceiling, z)]) {
        ceiling++
      }
      if (!transparentBlocks[name]) {
        // Not transparent, put at y0 and clear out anything above it
        this[_blocks][new Vec3(x, 0, z)] = { name: name, value: value, y: y }
        for (let iy = 1; iy <= ceiling; iy++) {
          delete this[_blocks][new Vec3(x, iy, z)]
        }
      } else {
        this.height = ceiling
        // Transparent, add to the ceiling
        this[_blocks][new Vec3(x, ceiling, z)] = { name: name, value: value, y: y }
      }
    }
  }

  getBlock (x, y, z) {
    const block = this[_blocks][new Vec3(x, y, z)]

    if (block) {
      return block
    }
    return { name: 'minecraft:air', value: 0 }
  }

  // Read in a subchunk
  read (data, yOffset) {
    const subChunkVersion = data.readInt8(0)
    const subChunkYOffset = 16 * yOffset

    // https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37#the-new-subchunk-format
    if ([1, 8, 9].includes(subChunkVersion)) {
      let offset = 1 // 1 past subChunkVersion
      let storages = 1
      let palette
      // Not sure what this does yet
      // let subChunkIndex = 0
      if (subChunkVersion === 8) {
        storages = data.readInt8(offset)
        offset++
      } else if (subChunkVersion === 9) {
        storages = data.readInt8(offset)
        offset++
        // subChunkIndex = data.readInt8(offset)
        offset++
      }

      for (let storage = 0; storage < storages; storage++) {
        const paletteAndFlag = data.readInt8(offset)
        offset++
        const isRuntime = (paletteAndFlag & 1) !== 0
        const bitsPerBlock = paletteAndFlag >> 1
        const blocksPerWord = Math.floor(32 / bitsPerBlock)
        const wordCount = Math.ceil(4096 / blocksPerWord)

        const indexBlocks = offset
        offset += (wordCount * 4)

        log.debug(`subChunk version: ${subChunkVersion}, size: ${data.length}, skip to: ${offset}`)
        log.debug(`runtime: ${isRuntime}, bits per block:${bitsPerBlock}, blocks per word: ${blocksPerWord}, word count: ${wordCount}`)

        if (!isRuntime) {
          // NBT TAG SERIALIZER
          palette = new PalettePersistance(data.readInt32LE(offset))
          offset += 4
          log.debug(`palette size: ${palette.size}`)

          for (let paletteID = 0; paletteID < palette.size; paletteID++) {
            const parsed = nbtParse.parse(data.slice(offset))
            palette.put(paletteID, parsed[Object.keys(parsed)[0]].name)
            offset += parsed.bufferSize
          }
        }

        let offsetNew = indexBlocks

        let position = 0

        for (let wordi = 0; wordi < wordCount; wordi++) {
          const word = data.readInt32LE(offsetNew)
          offsetNew += 4

          for (let block = 0; block < blocksPerWord; block++) {
            const state = (word >> ((position % blocksPerWord) * bitsPerBlock)) & ((1 << bitsPerBlock) - 1)
            const x = (position >> 8) & 0xF
            const y = position & 0xF
            const z = (position >> 4) & 0xF

            if (palette.get(state) !== 'minecraft:air') {
              log.debug('setBlock %o %s', { x, y: y + subChunkYOffset, z }, palette.get(state))
              try {
                this.setBlock(x, y + subChunkYOffset, z, palette.get(state), 0)
              } catch (err) {
                log.error(`Palette ID out of bounds!\t${state}\t:\t${palette.size}`)
                log.error(err)
              }
            }
            position++
          }
        }
      }
    } else if ([0, 2, 3, 4, 5, 6, 7].includes(subChunkVersion)) {
      const dataArray = data.slice(4097)

      for (let position = 0; position < 4096; position++) {
        const blockID = data.readInt8(position + 1)
        const blockData = getData(dataArray, position)

        const x = (position >> 8) & 0xF
        const y = position & 0xF
        const z = (position >> 4) & 0xF

        try {
          if (runtimeIDTable[blockID].name !== 'minecraft:air') {
            this.setBlock(x, y + subChunkYOffset, z, runtimeIDTable[blockID].name, blockData)
            // log.debug(runtimeIDTable[blockID])
          }
        } catch (err) {
          log.error(blockID + ' ' + err)
        }
        // log.debug(blockID)
      }
    } else {
      throw new Error(`Unknown subChunkVersion ${subChunkVersion}`)
    }
  }

  async render (sizeTexture, worldOffset, zoomLevelMax, outputPath) {
    const composeArray = []

    // Y-Axis
    for (let iy = 0; iy <= this.height; iy++) {
      // Z-Axis
      for (let iz = 0; iz < sizeTexture; iz++) {
        // X-Axis
        for (let ix = 0; ix < sizeTexture; ix++) {
          const block = this.getBlock(ix, iy, iz)
          let y = 0
          if (block.name !== 'minecraft:air') {
            // log.debug('render: %o %s', { x: ix, y: iy, z: iz }, block.name)
            if (renderMode === 'topdown_shaded') {
              y = block.y
            }

            const textureBuffer = await this[_cache].loadTexture(block.name, block.value, ix, iy, iz, y)
            composeArray.push({
              buffer: textureBuffer,
              x: sizeTexture * ix,
              y: sizeTexture * iz
            })
          }
        }
      }
    }

    if (composeArray.length > 0) {
      const mapY = zoomLevelMax
      const mapX = (this.X + Math.abs(worldOffset.x[0]))
      const mapZ = (this.Z + Math.abs(worldOffset.z[0]))
      const data = await mapnik.blend(composeArray, { width: 256, height: 256 })
      const dir = path.resolve(outputPath, 'map', mapY.toString(10), mapX.toString(10))
      await fs.mkdir(dir, { recursive: true })
      const file = path.join(dir, `${mapZ}.png`)
      log.debug(`write chunk ${this.X} ${this.Z} to ${file}`)
      await fs.writeFile(file, data)
    }
  }
}
