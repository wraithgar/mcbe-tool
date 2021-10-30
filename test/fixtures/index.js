'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const path = require('path')
const os = require('os')

const { LevelDB } = require('leveldb-zlib')
const nbt = require('prismarine-nbt')
const log = require('../../lib/log')
const logOut = log.out

class DB {
  constructor () {
    // no async functions in constructors :/
    this.path = require('fs').mkdtempSync(path.join(os.tmpdir(), 'mcbe-tool-'))
    this.output = []
    this.log = log
    log.out = o => this.output.push(o)
  }

  async cleanup () {
    await fs.rm(this.path, { recursive: true })
    log.out = logOut
  }

  async addDat (filename) {
    const fixture = getFixture(filename)
    const value = nbt.writeUncompressed(fixture)
    await fs.writeFile(path.join(this.path, 'level.dat'), value)
    const levelName = fixture.value.LevelName.value
    await fs.writeFile(path.join(this.path, 'levelname.txt'), levelName)
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
