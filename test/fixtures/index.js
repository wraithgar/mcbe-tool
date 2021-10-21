'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const rimraf = promisify(require('rimraf'))
const path = require('path')

const { LevelDB } = require('leveldb-zlib')
const log = require('../../lib/log')

class DB {
  constructor({ path:dbPath }) {
    this.path = dbPath
  }

  async cleanup() {
    await rimraf(this.path)
  }

  async addFixtures(filenames) {
    const db = new LevelDB(path.join(this.path, 'db'), { createIfMissing: true })
    await db.open()
    for (const filename of filenames) {
      const fixture = getFixture(filename)
      for (const keyString of Object.keys(fixture)) {
        const key = Buffer.from(keyString, 'hex')
        const data = Buffer.from(fixture[keyString], 'hex')
        // console.log(`db put`, key.toString('hex'))
        await db.put(key, data)
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
