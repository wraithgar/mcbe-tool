'use strict'

const lab = (exports.lab = require('@hapi/lab').script())
const { describe, it, before, beforeEach, after } = lab
const { expect } = require('@hapi/code')
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
})

beforeEach(({ context }) => {
  context.output.length = 0
})

after(async ({ context }) => {
  fixtures.log.out = context._logOut
  await context.db.cleanup()
})

describe('chunk', () => {
  before(async ({ context }) => {
    await context.db.addFixtures([
      'chunk-0-0',
      'chunk-0-1',
      'string-keys'
    ])
  })

  it('dumps a single chunk', async ({ context }) => {
    await dump.handler({
      type: 'chunk',
      level: context.db.path,
      chunk: { X: 0, Z: 0 }
    })
    expect(context.output.map(JSON.parse)).to.equal([fixtures.getFixture('chunk-0-0')])
  })
})

describe('level', () => {
  before(async ({ context }) => {
    await context.db.addDat('level')
  })

  it('dumps info about a level', async ({ context }) => {
    await dump.handler({
      type: 'level',
      level: context.db.path
    })
    expect(context.output.map(JSON.parse)).to.equal([fixtures.getFixture('level')])
  })
})
