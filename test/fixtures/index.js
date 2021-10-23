'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const path = require('path')

const { LevelDB } = require('leveldb-zlib')
const nbt = require('prismarine-nbt')
const log = require('../../lib/log')

class DB {
  constructor ({ path: dbPath }) {
    this.path = dbPath
  }

  async cleanup () {
    await fs.rm(this.path, { recursive: true })
  }

  async addDat (filename) {
    const fixture = getFixture(filename)
    const value = nbt.writeUncompressed(fixture)
    await fs.writeFile(path.join(this.path, 'level.dat'), value)
  }

  async addFixtures (filenames) {
    const db = new LevelDB(path.join(this.path, 'db'), { createIfMissing: true })
    await db.open()
    for (const filename of filenames) {
      const fixture = getFixture(filename)
      for (const keyString in fixture) {
        const key = Buffer.from(keyString, 'hex')
        const data = Buffer.from(fixture[keyString], 'hex')
        if (!await db.put(key, data, { sync: true })) {
          throw new Error('failed writing to leveldb')
        }
      }
    }
    await db.close()
  }
}

const getFixture = filename => require(path.resolve('.', 'test', 'fixtures', `${filename}.json`))

module.exports = {
  getFixture,
  log,
  DB
}
