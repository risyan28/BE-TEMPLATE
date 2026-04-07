// Show exact XML around H13 to see why injectCellName eats rows 14-15
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const Encryptor = require('xlsx-populate/lib/Encryptor')
const enc = new Encryptor()

// Use the ORIGINAL unprocessed source file from 2026-04-06
const files = fs
  .readdirSync('uploads/2026-04-06')
  .filter((f) => f.endsWith('.xlsm') && f.startsWith('AMTI'))
console.log('Files in 2026-04-06:', files)
;(async () => {
  const filePath = path.join('uploads/2026-04-06', files[files.length - 1])
  console.log('Using:', filePath)

  const buf = fs.readFileSync(filePath)
  let plainZip
  try {
    plainZip = await enc.decryptAsync(buf, 'cando')
  } catch {
    plainZip = buf
  }
  const zip = await JSZip.loadAsync(plainZip)

  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const mitumori = wbXml.match(/<sheet[^>]*name="mitumori"[^>]*r:id="(rId\d+)"/)
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relM =
    wbRels.match(new RegExp(`Id="${mitumori[1]}"[^>]+Target="([^"]+)"`)) ||
    wbRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${mitumori[1]}"`))
  const sheetPath = `xl/${relM[1]}`
  const xml = await zip.file(sheetPath).async('string')

  // Find H13 and surrounding context (1000 chars before & after)
  const h13Idx = xml.indexOf('r="H13"')
  if (h13Idx === -1) {
    console.log('H13 not found!')
    return
  }

  const start = Math.max(0, h13Idx - 200)
  const end = Math.min(xml.length, h13Idx + 800)
  console.log('\n=== XML around H13 (original unprocessed) ===')
  console.log(xml.slice(start, end))

  // Test the regex
  const cellRef = 'H13'
  const re = new RegExp(`<c r="${cellRef}"([^>]*)>[\\s\\S]*?</c>`)
  const match = xml.match(re)
  if (match) {
    console.log('\n=== Regex match for H13 ===')
    console.log('Match length:', match[0].length)
    console.log('Match:', match[0].slice(0, 500))
  }
})().catch((e) => console.error(e))
