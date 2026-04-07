// Diagnose the raw XML of the problematic file to find the bug
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')

const filePath = path.join(
  'uploads',
  '2026-04-07',
  'AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm',
)

const Encryptor = require('xlsx-populate/lib/Encryptor')
const enc = new Encryptor()

;(async () => {
  const buf = fs.readFileSync(filePath)
  const plainZip = await enc.decryptAsync(buf, 'cando')
  const zip = await JSZip.loadAsync(plainZip)

  // Find mitumori sheet
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]+>/gi)]
  console.log('=== Sheets ===')
  sheets.forEach((s) => console.log(' ', s[0]))

  // Find mitumori rId
  const mitumoriSheet = sheets.find((s) => /name="mitumori"/i.test(s[0]))
  const rId = mitumoriSheet[0].match(/r:id="(rId\d+)"/)?.[1]

  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relMatch =
    wbRels.match(new RegExp(`Id="${rId}"[^>]+Target="([^"]+)"`)) ||
    wbRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${rId}"`))
  const sheetPath = `xl/${relMatch[1]}`
  console.log('\n=== Sheet path:', sheetPath, '===')

  const xml = await zip.file(sheetPath).async('string')

  // Extract rows 10-16 to see what's in them
  console.log('\n=== Rows 10-16 raw XML ===')
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g
  let m
  while ((m = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(m[1])
    if (rowNum >= 10 && rowNum <= 16) {
      console.log(`\n--- Row ${rowNum} ---`)
      // Print cells in this row
      const cells = [
        ...m[0].matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^>]*>[\s\S]*?<\/c>/g),
      ]
      const emptyCells = [...m[0].matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^/]*\/>/g)]
      for (const c of cells) {
        const ref = c[1]
        const col = ref.replace(/\d+/g, '')
        if ('GHIJKLM'.includes(col) || (col.length === 1 && col >= 'G')) {
          console.log(`  ${ref}: ${c[0].slice(0, 300)}`)
        }
      }
      for (const c of emptyCells) {
        const ref = c[1]
        const col = ref.replace(/\d+/g, '')
        if ('GHIJKLM'.includes(col) || (col.length === 1 && col >= 'G')) {
          console.log(`  ${ref}: ${c[0].slice(0, 200)}`)
        }
      }
    }
  }

  // Also check if row 13 has t="inlineStr" cells
  console.log('\n=== All cells with inlineStr in the file ===')
  const inlineMatches = [
    ...xml.matchAll(/<c\b[^>]*t="inlineStr"[^>]*>[\s\S]*?<\/c>/g),
  ]
  inlineMatches.forEach((im) => console.log(' ', im[0].slice(0, 200)))

  // Check for H13, I13, J13 specifically
  console.log('\n=== H13, I13, J13 search ===')
  for (const ref of ['H13', 'I13', 'J13']) {
    const re = new RegExp(`<c\\b[^>]*r="${ref}"[\\s\\S]{0,500}?<\\/c>`)
    const found = xml.match(re)
    if (found) {
      console.log(`${ref}: ${found[0].slice(0, 300)}`)
    } else {
      // Check self-closing
      const re2 = new RegExp(`<c\\b[^>]*r="${ref}"[^/]*\\/>`)
      const found2 = xml.match(re2)
      console.log(`${ref}: ${found2 ? found2[0] : 'NOT FOUND'}`)
    }
  }

  // Check row 15 specifically
  console.log('\n=== Row 15 raw ===')
  const row15 = xml.match(/<row\b[^>]*\br="15"[^>]*>[\s\S]*?<\/row>/)
  if (row15) {
    console.log(row15[0].slice(0, 1000))
  } else {
    console.log('Row 15 NOT FOUND in XML!')
    // Check if row 14 goes directly to row 16
    const aroundRow15 = xml.match(/<\/row>\s*<row\b[^>]*\br="1[456]"/)
    if (aroundRow15) console.log('Context:', aroundRow15[0])
  }
})().catch((e) => console.error(e))
