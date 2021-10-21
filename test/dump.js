'use strict'

const lab = (exports.lab = require('@hapi/lab').script())
const { describe, it, before, beforeEach, after } = lab
const { expect } = require('@hapi/code')
const util = require('util')
const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
const os = require('os')
const fixtures = require('./fixtures')

const dump = require('../bin/cmds/dump.js')

before(async ({ context }) => {
  const path = await fs.mkdtemp(os.tmpdir())
  context.db = new fixtures.DB({ path })
  context.output = []
  context._logOut = fixtures.log.out
  fixtures.log.out = o => context.output.push(o)
  await context.db.addFixtures(['chunk-0-0', 'chunk-0-1'])
})

beforeEach(({ context }) => {
  context.output.length = 0
})

after(async ( { context }) => {
  fixtures.log.out= context._logOut
  await context.db.cleanup()
})

describe('dump', () => {
  it ('dumps a single chunk', async ( { context }) => {
    await dump.handler({
      level: context.db.path,
      chunk: { X: 0, Z: 0}
    })
    expect(context.output.map(JSON.parse)).to.equal([fixtures.getFixture('chunk-0-0')])
  })
})
