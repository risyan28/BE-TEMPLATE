const XlsxPopulate = require('xlsx-populate')
const JSZip = require('jszip')
const fs = require('fs'),
  os = require('os'),
  path = require('path')
;(function () {
  const P = require('xlsx-populate/lib/XmlParser')
  const o = P.prototype.parseAsync
  P.prototype.parseAsync = function (x) {
    if (typeof x === 'string' && x.charCodeAt(0) === 0xfeff) x = x.slice(1)
    return o.call(this, x)
  }
})()
;(async () => {
  const tmp = path.join(os.tmpdir(), 'qca-debug2.xlsm')
  const wb = await XlsxPopulate.fromFileAsync(
    path.join(
      __dirname,
      '../../uploads/signed/AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9-SIGNED.xlsm',
    ),
    { password: 'cando' },
  )
  await wb.toFileAsync(tmp)
  const zip = await JSZip.loadAsync(fs.readFileSync(tmp))

  // ── sheet3.xml checks ──────────────────────────────────────────────────────
  const s3 = await zip.file('xl/worksheets/sheet3.xml').async('string')
  const prot = s3.match(/<sheetProtection[^>]*\/?>/)
  console.log('\nsheetProtection tag:')
  console.log(prot ? prot[0] : '(none found)')
  console.log(
    'sheetProtection count:',
    (s3.match(/<sheetProtection/g) || []).length,
  )
  console.log(
    'sheetData open:',
    (s3.match(/<sheetData[\s>]/g) || []).length,
    'close:',
    (s3.match(/<\/sheetData>/g) || []).length,
  )

  // ── workbook.xml ───────────────────────────────────────────────────────────
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const sheetNames = [...wbXml.matchAll(/name="([^"]+)"/g)].map((m) => m[1])
  console.log('\nworkbook sheet names:', sheetNames.join(', '))

  // ── [Content_Types].xml duplicates ────────────────────────────────────────
  const ct = await zip.file('[Content_Types].xml').async('string')
  const overrides = [...ct.matchAll(/PartName="([^"]+)"/g)].map((m) => m[1])
  const defaults = [...ct.matchAll(/Extension="([^"]+)"/g)].map((m) => m[1])
  const dupOverrides = overrides.filter((v, i) => overrides.indexOf(v) !== i)
  const dupDefaults = defaults.filter((v, i) => defaults.indexOf(v) !== i)
  if (dupOverrides.length) console.log('\nDUPE PartName:', dupOverrides)
  else
    console.log(
      '\nContent_Types PartName: no duplicates (' +
        overrides.length +
        ' entries)',
    )
  if (dupDefaults.length) console.log('DUPE Extension:', dupDefaults)
  else
    console.log(
      'Content_Types Extension: no duplicates (' +
        defaults.length +
        ' entries)',
    )

  // ── drawing1 relationship IDs ──────────────────────────────────────────────
  const drawRelsPath = 'xl/drawings/_rels/drawing1.xml.rels'
  if (zip.file(drawRelsPath)) {
    const dr = await zip.file(drawRelsPath).async('string')
    const ids = [...dr.matchAll(/Id="(rId\d+)"/g)].map((m) => m[1])
    const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i)
    console.log('\ndrawing1 rels rIds (' + ids.length + '):', ids.join(', '))
    if (dupIds.length) console.log('DUPE rIds:', dupIds)
  }

  // ── styles.xml: check count attr format ───────────────────────────────────
  const sty = await zip.file('xl/styles.xml').async('string')
  const bordersTag = sty.match(/<borders[^>]*>/)
  const cellXfsTag = sty.match(/<cellXfs[^>]*>/)
  console.log('\nstyles <borders> tag:', bordersTag?.[0])
  console.log('styles <cellXfs> tag:', cellXfsTag?.[0])

  fs.unlinkSync(tmp)
  console.log('\nDone.')
})().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
