'use strict'

const lab = (exports.lab = require('@hapi/lab').script())
const { describe, it, before, beforeEach, after } = lab
const { expect } = require('@hapi/code')

const fixtures = require('./fixtures')
const cmd = require('../bin/cmds/dump.js')

before(async ({ context }) => {
  context.db = new fixtures.DB()
})

beforeEach(({ context }) => {
  context.db.output.length = 0
})

after(async ({ context }) => {
  await context.db.cleanup()
})

describe('dump chunk', () => {
  before(async ({ context }) => {
    await context.db.addFixtures([
      'chunk-0-0',
      'chunk-0-1',
      'string-keys'
    ])
  })

  it('dumps a single chunk', async ({ context }) => {
    await cmd.handler({
      type: 'chunk',
      level: context.db.path,
      chunk: { X: 0, Z: 0 }
    })
    expect(context.db.output.map(JSON.parse)).to.equal([fixtures.getFixture('chunk-0-0')])
  })
})

describe('dump level', () => {
  before(async ({ context }) => {
    await context.db.addDat('level')
  })

  it('dumps info about a level', async ({ context }) => {
    await cmd.handler({
      type: 'level',
      level: context.db.path
    })
    expect(context.db.output.map(JSON.parse)).to.equal([fixtures.getFixture('level')])
  })
})
