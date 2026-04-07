// Quick test: inject names into H13/I13/J13 using the FIXED approach and verify rows 14-15 survive
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const Encryptor = require('xlsx-populate/lib/Encryptor')
const enc = new Encryptor()

async function injectCellName(zip, sheetPath, col, username) {
  let xml = await zip.file(sheetPath).async('string')
  const rowNum = 13
  const colLetter = String.fromCharCode(65 + col)
  const cellRef = `${colLetter}${rowNum}`
  const safe = username
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const rowRe = new RegExp(
    `(<row\\b[^>]*\\br="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`,
  )
  const rowMatch = xml.match(rowRe)

  if (rowMatch) {
    const [fullRow, rowOpen, rowContent, rowClose] = rowMatch
    const cellRe = new RegExp(`<c r="${cellRef}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
    const cellMatch = rowContent.match(cellRe)
    const sMatch = cellMatch?.[1]?.match(/\bs="(\d+)"/)
    const styleAttr = sMatch ? ` s="${sMatch[1]}"` : ''
    const newCell = `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${safe}</t></is></c>`

    let newRowContent
    if (cellMatch) {
      newRowContent = rowContent.replace(cellRe, newCell)
    } else {
      newRowContent = rowContent + newCell
    }
    xml = xml.replace(fullRow, rowOpen + newRowContent + rowClose)
  } else {
    const newCell = `<c r="${cellRef}" t="inlineStr"><is><t>${safe}</t></is></c>`
    xml = xml.replace(
      '</sheetData>',
      `<row r="${rowNum}">${newCell}</row>\n</sheetData>`,
    )
  }
  zip.file(sheetPath, xml)
}

function findSheet(wbXml, wbRels) {
  const m = wbXml.match(/<sheet[^>]*name="mitumori"[^>]*r:id="(rId\d+)"/)
  if (!m) return null
  const rel =
    wbRels.match(new RegExp(`Id="${m[1]}"[^>]+Target="([^"]+)"`)) ||
    wbRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${m[1]}"`))
  return `xl/${rel[1]}`
}

function checkRows(xml, label) {
  console.log(`\n--- ${label} ---`)
  for (const rowNum of [13, 14, 15, 16]) {
    const rowRe = new RegExp(
      `<row\\b[^>]*\\br="${rowNum}"[^>]*>[\\s\\S]*?<\\/row>`,
    )
    const m = xml.match(rowRe)
    if (m) {
      const cellCount = [...m[0].matchAll(/<c\b/g)].length
      const refs = [...m[0].matchAll(/r="([A-Z]+\d+)"/g)]
        .map((x) => x[1])
        .join(', ')
      console.log(`  Row ${rowNum}: ${cellCount} cells [${refs}]`)
    } else {
      console.log(`  Row ${rowNum}: MISSING!`)
    }
  }
  for (const ref of ['H13', 'I13', 'J13']) {
    const re = new RegExp(`<c\\b[^>]*r="${ref}"[\\s\\S]{0,300}?<\\/c>`)
    const m = xml.match(re)
    console.log(`  ${ref}: ${m ? m[0].slice(0, 120) : 'NOT FOUND'}`)
  }
}

;(async () => {
  const filePath =
    'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm'
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath)
    process.exit(1)
  }

  const buf = fs.readFileSync(filePath)
  let plainZip
  try {
    plainZip = await enc.decryptAsync(buf, 'cando')
  } catch {
    plainZip = buf
  }
  const zip = await JSZip.loadAsync(plainZip)

  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const sheetPath = findSheet(wbXml, wbRels)
  console.log('Sheet path:', sheetPath)

  // Check BEFORE injection
  let xmlBefore = await zip.file(sheetPath).async('string')
  checkRows(xmlBefore, 'BEFORE injection')

  // Inject all 3 names (same cols as the service uses)
  await injectCellName(zip, sheetPath, 7, 'sari') // H13
  await injectCellName(zip, sheetPath, 8, 'checker_user') // I13
  await injectCellName(zip, sheetPath, 9, 'approver_user') // J13

  // Check AFTER injection
  let xmlAfter = await zip.file(sheetPath).async('string')
  checkRows(xmlAfter, 'AFTER injection')

  // Verdict
  const row14ok = /\br="14"/.test(xmlAfter)
  const row15ok = /\br="15"/.test(xmlAfter)
  console.log(
    `\n=== VERDICT: Row 14 ${row14ok ? 'OK' : 'MISSING!'}, Row 15 ${row15ok ? 'OK' : 'MISSING!'} ===`,
  )
  if (row14ok && row15ok) {
    console.log('FIX WORKS!')
  } else {
    console.log('STILL BROKEN!')
  }
})().catch((e) => console.error(e))
