const chalk = require('chalk')
const babel = require('@babel/core')
const { promisify } = require('util')
const glob = promisify(require('glob'))
const fs = require('fs')
const path = require('path')

const { mkdir, stat, writeFile } = fs.promises

const SOURCE = 'packages/{*,@uppy/*}/src/**/*.js?(x)'
// Files not to build (such as tests)
const IGNORE = /\.test\.js$|__mocks__|svelte|angular|companion\//
// Files that should trigger a rebuild of everything on change
const META_FILES = [
  'babel.config.js',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'bin/build-lib.js',
]

function lastModified (file, createParentDir = false) {
  return stat(file).then((s) => s.mtime, async (err) => {
    if (err.code === 'ENOENT') {
      if (createParentDir) {
        await mkdir(path.dirname(file), { recursive: true })
      }
      return 0
    }
    throw err
  })
}

async function buildLib () {
  const metaMtimes = await Promise.all(META_FILES.map((filename) => lastModified(path.join(__dirname, '..', filename))))
  const metaMtime = Math.max(...metaMtimes)

  const files = await glob(SOURCE)
  /* eslint-disable no-continue */
  for (const file of files) {
    if (IGNORE.test(file)) {
      continue
    }
    const libFile = file.replace('/src/', '/lib/')

    // on a fresh build, rebuild everything.
    if (!process.env.FRESH) {
      const [srcMtime, libMtime] = await Promise.all([
        lastModified(file),
        lastModified(libFile, true),
      ])
      // Skip files that haven't changed
      if (srcMtime < libMtime && metaMtime < libMtime) {
        continue
      }
    } else {
      await mkdir(path.dirname(libFile), { recursive: true })
    }

    const { code, map } = await babel.transformFileAsync(file, { sourceMaps: true })
    await Promise.all([
      writeFile(libFile, code),
      writeFile(`${libFile}.map`, JSON.stringify(map)),
    ])
    console.log(chalk.green('Compiled lib:'), chalk.magenta(libFile))
  }
  /* eslint-enable no-continue */
}

console.log('Using Babel version:', require('@babel/core/package.json').version)

buildLib().catch((err) => {
  console.error(err)
  process.exit(1)
})
