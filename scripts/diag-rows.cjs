// Diagnose: dump row 13 and nearby XML from the original encrypted file
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')

const Encryptor = require('xlsx-populate/lib/Encryptor')
const enc = new Encryptor()

const filePath = path.join(
  'uploads',
  '2026-04-06',
  'AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_34311c98.xlsm',
)

;(async () => {
  const buf = fs.readFileSync(filePath)
  const plainZip = await enc.decryptAsync(buf, 'cando')
  const zip = await JSZip.loadAsync(plainZip)

  // Find mitumori sheet path
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]+>/gi)]
  const mitumori = sheets.find((s) => /name="mitumori"/i.test(s[0]))
  const rId = mitumori[0].match(/r:id="(rId\d+)"/)[1]

  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relMatch = wbRels.match(
    new RegExp(`<Relationship[^>]+Id="${rId}"[^>]+Target="([^"]+)"`),
  )
  const sheetPath = `xl/${relMatch[1]}`
  console.log('Sheet path:', sheetPath)

  const xml = await zip.file(sheetPath).async('string')

  // Extract rows 10-16
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g
  let match
  while ((match = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(match[1])
    if (rowNum >= 10 && rowNum <= 16) {
      console.log(`\n=== ROW ${rowNum} (${match[0].length} chars) ===`)
      // Show cells in this row
      const cells = [
        ...match[0].matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^>]*>[\s\S]*?<\/c>/g),
      ]
      for (const c of cells) {
        const ref = c[1]
        console.log(
          `  ${ref}: ${c[0].slice(0, 200)}${c[0].length > 200 ? '...' : ''}`,
        )
      }
      // Also check for self-closing cells
      const selfClosing = [
        ...match[0].matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^>]*\/>/g),
      ]
      for (const c of selfClosing) {
        console.log(`  ${c[1]}: ${c[0]}`)
      }
    }
  }

  // Also check: does row 15 exist?
  const row15 = xml.match(/<row\b[^>]*\br="15"[^>]*>[\s\S]*?<\/row>/)
  console.log(
    '\n=== ROW 15 exists?',
    !!row15,
    row15 ? `(${row15[0].length} chars)` : '',
  )

  // Check total rows
  const allRows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)]
  const rowNums = allRows.map((r) => parseInt(r[1])).sort((a, b) => a - b)
  console.log('\nAll row numbers:', rowNums.join(', '))
})()
