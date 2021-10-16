module.exports = require('yargs')
  .usage('$0 [options]')
  .epilogue('This is very much a work in progress.')
  .commandDir('cmds')
  .demandCommand(1, 'A command is required.')
  .scriptName('mcbe-render')
  .help()
  .version()
  .options({
    debug: {
      description: 'show debug messages',
      type: 'boolean',
      alias: 'd',
      default: false
    }
  })
  .middleware(argv => {
    if (!process.env.DEBUG) {
      process.env.DEBUG = 'vellum:*'
    } else {
      process.env.DEBUG = `${process.env.DEBUG},vellum:*`
    }
    if (!argv.debug) {
      process.env.DEBUG = `${process.env.DEBUG},-vellum:debug`
    }
  })
  .argv
