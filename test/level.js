'use strict'

const lab = (exports.lab = require('@hapi/lab').script())
const { describe, it, before, after } = lab
const { expect } = require('@hapi/code')

const fixtures = require('./fixtures')
const cmd = require('../bin/cmds/level.js')

before(async ({ context }) => {
  context.db = new fixtures.DB()
})

after(async ({ context }) => {
  await context.db.cleanup()
})

describe('level', () => {
  before(async ({ context }) => {
    await context.db.addDat('level')
  })

  it('shows info about the level', async ({ context }) => {
    await cmd.handler({
      level: context.db.path
    })
    const out = [
      'Name: Main Survival World',
      'Seed: 0,-1382478983',
      'Inventory version: 1.17.31',
      'Spawn point z,x: 4,44 (radius 5)'
    ]
    expect(context.db.output).to.equal(out)
  })
})
