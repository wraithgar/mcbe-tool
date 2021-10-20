'use strict'

const Vec3 = require('vec3')
const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
const mapnik = promisify(require('mapnik'))
const path = require('path')

const transparentBlocks = require('../lookup-tables/transparent-blocks-table.json')
// prismarine pukes on some of the subchunk nbt data?
const nbtParse = require('./nbt-parse.js')
const runtimeIDTable = require('../lookup-tables/runtimeid-table.json')

const Cache = require('./cache')
const log = require('./log')

const renderMode = 'topdown_shaded'

const _blocks = Symbol('blocks')
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

module.exports = class Chunk {
  // Key is just the coords part of the key
  constructor (key) {
    this[_blocks] = {}
    this[_key] = Buffer.from(key, 'hex')
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

  // Called in increasing y order per subchunk
  // Called out of y order between subchunks
  setBlock (x, y, z, block) {
    //this[_blocks]['0105'] = { blocks, y }
    //y is the real y coordinate of the bottom block (only non-transparent block)

    if (!x && !z) {
      log.debug('setBlock %o %o', { x, y: y, z }, block)
    }
    const coords = Buffer.from([x, z]).toString('hex')
    const blocks = this[_blocks][coords]
    const isTransparent = transparentBlocks[block.name]
    if (!blocks) {
      // First block at this coordinate
      if (isTransparent) {
        this[_blocks][coords] = { blocks: [, block] }
      } else {
        this[_blocks][coords] = { blocks: [block], y }
      }
      return
    }
    if (y < blocks.y) {
      // We're already rendered higher than this
      return
    }
    if (isTransparent) {
      this[_blocks][coords].blocks.push(block)
    } else {
      this[_blocks][coords] = { blocks: [ block ], y }
    }
  }

  // This y is the rendered y, not the real y value from the original block
  getBlocks (x, z) {
    const coords = Buffer.from([x, z]).toString('hex')
    return this[_blocks][coords]
  }

  // Read in a subchunk
  read (data, yOffset) {
    const subChunkVersion = data.readInt8(0)
    let subChunkYOffset = 16 * yOffset

    if ([1, 8, 9].includes(subChunkVersion)) {
      // console.log(data.toString('hex'))
      let offset = 1 // 1 past subChunkVersion
      let storages = 1
      // Not sure what this does yet
      let subChunkIndex = 0
      if (subChunkVersion === 1) {
        // [version:byte][block storage]
      } else if (subChunkVersion === 8) {
        // [version:byte][num_storages:byte][block storage1]...[blockStorageN]
        storages = data.readInt8(offset)
        offset++
      } else if (subChunkVersion === 9) {
        // [version:byte][num_storages:byte][sub_chunk_index:byte][block storage1]...[blockStorageN]
        storages = data.readInt8(offset)
        offset++
        subChunkIndex = data.readInt8(offset)
        subChunkYOffset = 16 * subChunkIndex
        log.debug(`subChunk index is now ${subChunkIndex}`)
        offset++
      }

      /*
         * palette lookup:
         * 1  // 32 blocks per word
         * 2  // 16 blocks per word
         * 3  // 10 blocks and 2 bits of padding per word
         * 4  // 8 blocks per word
         * 5  // 6 blocks and 2 bits of padding per word
         * 6  // 5 blocks and 2 bits of padding per word
         * 8  // 4 blocks per word
         * 16 // 2 blocks per word
         */
      for (let storage = 0; storage < storages; storage++) {
        const paletteAndFlag = data.readInt8(offset)
        if (!paletteAndFlag) {
          log.info(`Skipping weird single block subchunk at ${this.X},${this.Z}`)
          return
        }
        offset++
        const isRuntime = Boolean(paletteAndFlag & 1)
        const bitsPerBlock = paletteAndFlag >> 1
        const blocksPerWord = Math.floor(32 / bitsPerBlock)
        const wordCount = Math.ceil(4096 / blocksPerWord)

        // The palette data is after the words, but we need it before we
        // iterate through the words
        const wordOffset = offset
        offset += (wordCount * 4)

        log.debug(`subChunk version: ${subChunkVersion}, index: ${subChunkIndex}, size: ${data.length}, skip to: ${offset}`)
        log.debug(`runtime: ${isRuntime}, bits per block:${bitsPerBlock}, blocks per word: ${blocksPerWord}, word count: ${wordCount}`)

        // handling isRuntime would require parsing pallete.size varints and
        // look up as runtimeID in the lookup table, then update offset
        // accordingly and store in the palette
        if (!isRuntime) {
          const palette = new Array(data.readInt32LE(offset))
          offset += 4
          log.debug(`palette size: ${palette.length}`)
          for (let i = 0; i < palette.length; i++) {
            const { '':parsed, bufferSize }  = nbtParse.parse(data.slice(offset))
            palette[i] = parsed
            offset += bufferSize
          }

          for (let i = 0; i < 4096; i++) {
            // Blocks are stored in XZY order (i.e. incrementing Y first)
            const maskval = data.readInt32LE(wordOffset + Math.floor(i / blocksPerWord) * 4)
            const state = (maskval >> ((i % blocksPerWord) * bitsPerBlock)) & ((1 << bitsPerBlock) - 1)
            // if (state > palette.length) { oob error }

            const x = (i >> 8) & 0xF
            const z = (i >> 4) & 0xF
            const y = i & 0xF

            const block = palette[state]
            if (block.name !== 'minecraft:air') {
              this.setBlock(x, y + subChunkYOffset, z, block)
            }
          }
        }
      }
    // } else if ([0, 2, 3, 4, 5, 6, 7].includes(subChunkVersion)) {
    //   // "Versions 2 to 7 have been blocked out because tools in the wild used them wrong"
    //   // https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37#gistcomment-2569312
    //   const dataArray = data.slice(4097)

    //   for (let position = 0; position < 4096; position++) {
    //     const blockID = data.readInt8(position + 1)
    //     const blockData = getData(dataArray, position)

    //     const x = (position >> 8) & 0xF
    //     const y = position & 0xF
    //     const z = (position >> 4) & 0xF

    //     try {
    //       if (runtimeIDTable[blockID].name !== 'minecraft:air') {
    //         this.setBlock(x, y + subChunkYOffset, z, { name: runtimeIDTable[blockID].name, value: blockData })
    //         // log.debug(runtimeIDTable[blockID])
    //       }
    //     } catch (err) {
    //       log.error(blockID + ' ' + err)
    //     }
    //     // log.debug(blockID)
    //   }
    } else {
      throw new Error(`Unknown subChunkVersion ${subChunkVersion}`)
    }
  }

  async render (sizeTexture, worldOffset, zoomLevelMax, outputPath) {
    const composeArray = []

    // X-Axis
    for (let ix = 0; ix < sizeTexture; ix++) {
      // Z-Axis
      for (let iz = 0; iz < sizeTexture; iz++) {
        const { blocks, y } = this.getBlocks(ix, iz)
        for (let iy = 0; iy < blocks.length; iy++) {
          const block = blocks[iy]
          if (block.name !== 'minecraft:air') {
            // log.debug('render: %o %o', { x: ix, y: iy, z: iz }, block)
            if (renderMode !== 'topdown_shaded') {
              y = 0
            }

            const textureBuffer = await this[_cache].loadTexture(block, ix, iy, iz, y)
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
