module.exports = require('yargs')
  .usage('$0 [options]')
  .epilogue('This is very much a work in progress.')
  .commandDir('cmds')
  .demandCommand(1, 'A command is required.')
  .scriptName('mcbe-tool')
  .help()
  .version()
  .options({
    level: {
      description: 'path to the minecraft level',
      type: 'string',
      alias: 'l',
      demandOption: true
    },
    debug: {
      description: 'show debug messages',
      type: 'boolean',
      alias: 'd',
      default: false
    }
  })
  .middleware(argv => {
    if (!process.env.DEBUG) {
      process.env.DEBUG = 'mcbe-tool:*'
    } else {
      process.env.DEBUG = `${process.env.DEBUG},mcbe-tool:*`
    }
    if (!argv.debug) {
      process.env.DEBUG = `${process.env.DEBUG},-mcbe-tool:debug`
    }
  })
  .argv
