/**
 * debug-xlsm.js  — dump isi XML dari SIGNED.xlsm untuk menemukan corruption
 */
const XlsxPopulate = require('xlsx-populate')
const JSZip = require('jszip')
const fs = require('fs')
const os = require('os')
const path = require('path')

;(function patchBom() {
  const XmlParser = require('xlsx-populate/lib/XmlParser')
  const orig = XmlParser.prototype.parseAsync
  XmlParser.prototype.parseAsync = function (x) {
    if (typeof x === 'string' && x.charCodeAt(0) === 0xfeff) x = x.slice(1)
    return orig.call(this, x)
  }
})()
;(async () => {
  const src = path.join(
    __dirname,
    '../../uploads/signed/AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9-SIGNED.xlsm',
  )
  const tmp = path.join(os.tmpdir(), 'qca-debug.xlsm')

  console.log('Decrypting...')
  const wb = await XlsxPopulate.fromFileAsync(src, { password: 'cando' })
  await wb.toFileAsync(tmp)
  console.log('OK. Checking XML files...\n')

  const buf = fs.readFileSync(tmp)
  const zip = await JSZip.loadAsync(buf)
  const xmlFiles = Object.keys(zip.files).filter(
    (f) => f.endsWith('.xml') || f.endsWith('.rels'),
  )

  let issues = 0

  for (const name of xmlFiles) {
    const txt = await zip.file(name).async('string')

    // 1. Unescaped & (not part of a valid entity)
    const stripped = txt.replace(
      /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,
      '',
    )
    if (stripped.includes('&')) {
      console.log('UNESCAPED &:', name)
      issues++
    }

    // 2. styles.xml — count attribute mismatches
    if (name === 'xl/styles.xml') {
      const borderCount = (txt.match(/<border[\s>]/g) || []).length
      const declBorders = txt.match(/borders\s+count="(\d+)"/)?.[1]
      if (declBorders && parseInt(declBorders) !== borderCount) {
        console.log(
          `STYLES borders count MISMATCH: declared=${declBorders} actual=${borderCount}`,
        )
        issues++
      }
      const xfCount = (txt.match(/<xf[\s>]/g) || []).length
      const declXf = txt.match(/cellXfs\s+count="(\d+)"/)?.[1]
      if (declXf && parseInt(declXf) !== xfCount) {
        console.log(
          `STYLES cellXfs count MISMATCH: declared=${declXf} actual=${xfCount}`,
        )
        issues++
      }
      const fontCount = (txt.match(/<font[\s>]/g) || []).length
      const declFonts = txt.match(/fonts\s+count="(\d+)"/)?.[1]
      if (declFonts && parseInt(declFonts) !== fontCount) {
        console.log(
          `STYLES fonts count MISMATCH: declared=${declFonts} actual=${fontCount}`,
        )
        issues++
      }
      const fillCount = (txt.match(/<fill[\s>]/g) || []).length
      const declFills = txt.match(/fills\s+count="(\d+)"/)?.[1]
      if (declFills && parseInt(declFills) !== fillCount) {
        console.log(
          `STYLES fills count MISMATCH: declared=${declFills} actual=${fillCount}`,
        )
        issues++
      }

      // Dump actual numbers
      console.log(
        `\nstyles.xml counts:  borders declared=${declBorders} actual=${borderCount}` +
          `  cellXfs declared=${declXf} actual=${xfCount}` +
          `  fonts declared=${declFonts} actual=${fontCount}` +
          `  fills declared=${declFills} actual=${fillCount}\n`,
      )
    }

    // 3. drawing XML — unclosed tags check
    if (name.startsWith('xl/drawings/') && name.endsWith('.xml')) {
      const openAnchors = (txt.match(/<xdr:(one|two)CellAnchor[\s>]/g) || [])
        .length
      const closeAnchors = (txt.match(/<\/xdr:(one|two)CellAnchor>/g) || [])
        .length
      if (openAnchors !== closeAnchors) {
        console.log(
          `DRAWING unclosed anchors in ${name}: open=${openAnchors} close=${closeAnchors}`,
        )
        issues++
      }
      console.log(
        `drawing ${name}: ${openAnchors} anchors (open=${openAnchors} close=${closeAnchors})`,
      )
    }
  }

  console.log(
    issues === 0 ? '\nAll XML looks clean.' : `\n${issues} issue(s) found.`,
  )
  fs.unlinkSync(tmp)
})().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
