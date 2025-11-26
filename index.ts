#!/usr/bin/env bun

import AdmZip from 'adm-zip'
import archiver from 'archiver'
import { glob } from 'glob'
import xml2js from 'xml2js'
import fs from 'fs-extra'
import path from 'path'
import { select, confirm, text, intro, outro, spinner } from '@clack/prompts'
import pc from 'picocolors'
import type { CliArgs } from './types.js'

async function main() {
  intro(pc.cyan('ePub Splitter CLI'))
  const cwd = process.cwd()
  const epubFiles = glob.sync('*.epub', { cwd })
  if (epubFiles.length === 0) {
    outro(pc.red('No .epub file found in the current directory.'))
    return
  }

  const input = (await select({
    message: 'Select the EPUB file to split:',
    options: epubFiles.map((f) => ({ value: f, label: f }))
  })) as string
  if (!input) {
    outro(pc.yellow('No file selected.'))
    return
  }

  const marker = (await text({
    message: 'Text/regex to identify the start of each page:',
    initialValue: 'class="stl_ stl_02"'
  })) as string

  const preview = (await confirm({
    message:
      'Only extract and write the new .xhtml files but do NOT repackage the EPUB? (preview)',
    initialValue: false
  })) as boolean

  let output: string | null = null
  if (!preview) {
    output = (await text({
      message: 'Output EPUB file name:',
      initialValue: input.replace(/\.epub$/, '-split.epub')
    })) as string
    if (!output) {
      const dir = path.dirname(input)
      const base = path.basename(input, path.extname(input))
      output = path.join(dir, `${base}-split.epub`)
    }
  }

  // Show summary and ask for confirmation
  outro(pc.bold(pc.cyan('Summary:')))
  console.log(pc.cyan(`  📄 EPUB file: ${input}`))
  console.log(pc.cyan(`  📦 Output: ${output}`))
  console.log(pc.cyan(`  🔎 Marker: ${marker}`))
  console.log(pc.cyan(`  👀 Preview mode: ${preview ? 'Enabled' : 'Disabled'}`))
  const proceed = await confirm({
    message: pc.bold('Proceed with these settings?'),
    initialValue: true
  })
  if (!proceed) {
    outro(pc.yellow('Aborted by user.'))
    return
  }

  if (!fs.existsSync(input)) {
    outro(pc.red(`File does not exist: ${input}`))
    return
  }

  const tmpDir = path.join(process.cwd(), `.split_epub_tmp_${Date.now()}`)
  await fs.ensureDir(tmpDir)

  outro(pc.cyan('📦 Extracting EPUB...'))
  const zip = new AdmZip(input)
  zip.extractAllTo(tmpDir, true)
  outro(pc.green('EPUB extracted.'))

  outro(pc.cyan('🔍 Scanning HTML/XHTML files...'))
  const htmlFiles = glob.sync('**/*.+(xhtml|html)', {
    cwd: tmpDir,
    nodir: true
  })
  outro(pc.green(`Found ${htmlFiles.length} HTML/XHTML files.`))

  const safeMarker = marker.replace(/[-/\\^$*+?.()|[\]{}]/g, (ch) => `\\${ch}`)
  const splitRegex = new RegExp(`(?=<div[^>]*\\b${safeMarker}[^>]*>)`, 'gi')

  const createdFilesByOriginal = {}
  let totalFragments = 0

  for (const relPath of htmlFiles) {
    const absPath = path.join(tmpDir, relPath)
    let content = await fs.readFile(absPath, 'utf8')
    if (!content.match(new RegExp(safeMarker, 'i'))) continue

    let prefix = content.slice(0, content.search(/<body[^>]*>/i))
    prefix = prefix.replace(/<meta[^>]*http-equiv[^>]*>/gi, '')
    prefix = prefix.replace(/<!--\[if IE\]>.*?<!\[endif\]-->/gis, '')
    let xmlDecl = ''
    let doctypeDecl = ''
    let htmlOpen = ''
    let headBlock = ''
    let bodyOpen = ''
    const xmlMatch = prefix.match(/<\?xml[^>]*>/i)
    if (xmlMatch) xmlDecl = xmlMatch[0]
    else xmlDecl = '<?xml version="1.0" encoding="utf-8"?>'
    const doctypeMatch = prefix.match(/<!DOCTYPE[^>]*>/i)
    if (doctypeMatch) doctypeDecl = doctypeMatch[0]
    else doctypeDecl = '<!DOCTYPE html>'
    const htmlMatch = prefix.match(/<html[^>]*>/i)
    if (htmlMatch) htmlOpen = htmlMatch[0]
    else
      htmlOpen =
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
    const headMatch2 = prefix.match(/<head[\s\S]*?<\/head>/i)
    if (headMatch2) headBlock = headMatch2[0]
    else
      headBlock =
        '<head><title></title><link rel="stylesheet" type="text/css" href="css/style.css"/></head>'
    const bodyOpenMatch2 = content.match(/<body[^>]*>/i)
    if (bodyOpenMatch2) bodyOpen = bodyOpenMatch2[0]
    else bodyOpen = '<body style="background: white;">'
    const bodyCloseIndex2 = content.toLowerCase().lastIndexOf('</body>')
    const bodySuffix =
      bodyCloseIndex2 !== -1
        ? content.slice(bodyCloseIndex2 + '</body>'.length)
        : ''

    let parts = content.split(splitRegex)
    if (parts.length > 1 && (!parts[0].trim() || /^\s*$/m.test(parts[0]))) {
      parts = parts.slice(1)
    }
    parts = parts.filter((p: string) => p.trim())
    if (parts.length <= 1) continue

    outro(pc.cyan(`✂️ Splitting ${relPath} into ${parts.length} fragments...`))
    totalFragments += parts.length

    const dirOfFile = path.dirname(absPath)
    const baseName =
      typeof path.basename === 'function' && typeof path.extname === 'function'
        ? path.basename(relPath, path.extname(relPath))
        : ''
    ;(
      createdFilesByOriginal as Record<
        string,
        string[] & { originalRemoved?: boolean }
      >
    )[relPath] = []

    for (let i = 0; i < parts.length; i++) {
      const frag = parts[i].trim()
      const seq = String(i + 1).padStart(3, '0')
      const newFileName = `${baseName}_pg${seq}.xhtml`
      const newRelPath = path.posix.join(
        path.dirname(relPath).split(path.sep).join('/'),
        newFileName
      )
      const newAbsPath = path.join(dirOfFile, newFileName)
      let cleanFrag = frag.replace(/<!--\[if IE\]>.*?<!\[endif\]-->/gis, '')
      cleanFrag = cleanFrag.replace(/<\/?html[^>]*>/gi, '')
      cleanFrag = cleanFrag.replace(/<\/?body[^>]*>/gi, '')
      const newDoc = `${xmlDecl}\n${doctypeDecl}\n${htmlOpen}\n${headBlock}\n${bodyOpen}\n${cleanFrag}\n</body>\n</html>`
      await fs.writeFile(newAbsPath, newDoc, 'utf8')
      const arr = (
        createdFilesByOriginal as Record<
          string,
          string[] & { originalRemoved?: boolean }
        >
      )[relPath]
      if (arr) {
        arr.push(newRelPath)
      }
    }
    await fs.remove(absPath)
    const arr = (
      createdFilesByOriginal as Record<
        string,
        string[] & { originalRemoved?: boolean }
      >
    )[relPath]
    if (arr) {
      ;(arr as any).originalRemoved = true
    }
  }

  outro(pc.cyan('📝 Updating OPF manifest/spine...'))
  const opfFiles = glob.sync('**/*.opf', { cwd: tmpDir, nodir: true })
  if (opfFiles.length === 0) {
    outro(
      pc.yellow(
        'No .opf file found; manifest/spine will not be updated automatically. Manual review recommended.'
      )
    )
  } else {
    const opfPath = path.join(tmpDir, opfFiles[0] as string)
    outro(pc.cyan(`Updating OPF: ${opfFiles[0]}`))
    try {
      const opfXml = await fs.readFile(opfPath, 'utf8')
      const parser = new xml2js.Parser()
      const opfObj = await parser.parseStringPromise(opfXml)
      const pkg = opfObj.package || opfObj['pkg:package'] || opfObj
      const manifest =
        pkg.manifest && pkg.manifest[0] && pkg.manifest[0].item
          ? pkg.manifest[0].item
          : []
      const spine =
        pkg.spine && pkg.spine[0] && pkg.spine[0].itemref
          ? pkg.spine[0].itemref
          : []
      const hrefToId: Record<string, string> = {}
      for (const it of manifest) {
        const href = it.$ && it.$.href ? it.$.href : null
        const id = it.$ && it.$.id ? it.$.id : null
        if (href && id) hrefToId[href] = id
      }
      let allPages: string[] = []
      for (const newRelList of Object.values(createdFilesByOriginal)) {
        if (Array.isArray(newRelList)) {
          allPages = allPages.concat(newRelList as string[])
        }
      }
      allPages.sort()
      for (const [origRel] of Object.entries(createdFilesByOriginal)) {
        const origBase = path.basename(origRel)
        pkg.manifest[0].item = pkg.manifest[0].item.filter((it: any) => {
          const href = it.$ && it.$.href ? it.$.href : ''
          return !href.endsWith(origBase)
        })
        pkg.spine[0].itemref = pkg.spine[0].itemref.filter((ir: any) => {
          const idref = ir.$ && ir.$.idref ? ir.$.idref : ''
          return !idref.includes(path.basename(origRel, path.extname(origRel)))
        })
      }
      const opfDir = path.dirname(opfFiles[0] as string)
      for (const newRel of allPages) {
        let relToOpf = path.relative(opfDir, newRel).split(path.sep).join('/')
        if (opfDir === '' || opfDir === '.')
          relToOpf = newRel.split(path.sep).join('/')
        const newId = `${path.basename(newRel, path.extname(newRel)).replace(/[^a-zA-Z0-9_-]/g, '_')}`
        if (
          !pkg.manifest[0].item.some(
            (it: any) => it.$ && it.$.href === relToOpf
          )
        ) {
          pkg.manifest[0].item.push({
            $: {
              id: newId,
              href: relToOpf,
              'media-type': 'application/xhtml+xml'
            }
          })
        }
      }
      pkg.spine[0].itemref = allPages.map((nr) => ({
        $: {
          idref: path
            .basename(nr, path.extname(nr))
            .replace(/[^a-zA-Z0-9_-]/g, '_')
        }
      }))
      if (pkg.guide) {
        delete pkg.guide
      }
      const builder = new xml2js.Builder({
        headless: false,
        xmldec: { version: '1.0', encoding: 'utf-8' }
      })
      const newOpfXml = builder.buildObject(opfObj)
      await fs.writeFile(opfPath, newOpfXml, 'utf8')
      outro(
        pc.green(
          'OPF updated. Please review the file and nav (nav.xhtml) manually.'
        )
      )
    } catch (err) {
      outro(pc.red('Error updating OPF: ' + String(err)))
    }
  }

  if (preview) {
    outro(
      pc.yellow(
        `--preview enabled: EPUB is not repackaged. New files are in ${tmpDir}`
      )
    )
    outro(pc.bold(pc.cyan(`Total fragments created: ${totalFragments}`)))
    return
  }

  outro(pc.cyan('📚 Repackaging EPUB...'))
  await packDirToEpub(tmpDir, output as string)
  outro(pc.green('EPUB generated.'))

  outro(pc.bold(pc.cyan('Summary:')))
  outro(pc.green(`✔️ Done. Generated file: ${output}`))
  outro(pc.cyan(`🗂️ Temporary folder (you can delete it): ${tmpDir}`))
  outro(pc.bold(pc.cyan(`Total fragments created: ${totalFragments}`)))
}

async function packDirToEpub(dir: string, outPath: string): Promise<void> {
  const mimetypePath = path.join(dir, 'mimetype')
  const output = fs.createWriteStream(outPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(output)
  if (await fs.pathExists(mimetypePath)) {
    archive.append(fs.createReadStream(mimetypePath), {
      name: 'mimetype',
      store: true
    })
  }
  archive.directory(dir, false, (entry: { name: string }) => {
    // Avoid adding mimetype again
    if (entry.name === 'mimetype') return false
    return entry
  })
  await archive.finalize()
  return new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    archive.on('error', (err: Error) => reject(err))
  })
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    outro(pc.red(`Error: ${err.message}`))
  } else {
    outro(pc.red('Unknown error.'))
  }
})
