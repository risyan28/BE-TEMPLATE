// Verify that the NEWEST file (097a8ce5) has row 15 intact vs the OLD file (4ed19678)
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const Encryptor = require('xlsx-populate/lib/Encryptor')
const enc = new Encryptor()

async function checkRow15(label, filePath) {
  const buf = fs.readFileSync(filePath)
  console.log(`\n=== ${label} (${buf.length} bytes) ===`)

  let plainZip
  try {
    plainZip = await enc.decryptAsync(buf, 'cando')
  } catch {
    // Maybe it's already a ZIP
    plainZip = buf
  }
  const zip = await JSZip.loadAsync(plainZip)

  // Find mitumori sheet path
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const mitumori = wbXml.match(/<sheet[^>]*name="mitumori"[^>]*r:id="(rId\d+)"/)
  if (!mitumori) {
    console.log('  mitumori not found')
    return
  }
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relM =
    wbRels.match(new RegExp(`Id="${mitumori[1]}"[^>]+Target="([^"]+)"`)) ||
    wbRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${mitumori[1]}"`))
  const sheetPath = `xl/${relM[1]}`
  const xml = await zip.file(sheetPath).async('string')

  // Check rows 14-16
  for (const rowNum of [14, 15, 16]) {
    const rowRe = new RegExp(
      `<row\\b[^>]*\\br="${rowNum}"[^>]*>[\\s\\S]*?<\\/row>`,
    )
    const m = xml.match(rowRe)
    if (m) {
      const cellCount = [...m[0].matchAll(/<c\b/g)].length
      // Extract cell refs
      const refs = [...m[0].matchAll(/r="([A-Z]+\d+)"/g)]
        .map((x) => x[1])
        .join(', ')
      console.log(`  Row ${rowNum}: ${cellCount} cells [${refs}]`)
    } else {
      console.log(`  Row ${rowNum}: MISSING!`)
    }
  }

  // Check H13, I13, J13
  for (const ref of ['H13', 'I13', 'J13']) {
    const re = new RegExp(`<c\\b[^>]*r="${ref}"[\\s\\S]{0,300}?<\\/c>`)
    const m = xml.match(re)
    console.log(`  ${ref}: ${m ? m[0].slice(0, 120) : 'NOT FOUND'}`)
  }
}

;(async () => {
  await checkRow15(
    'OLD file (4ed19678)',
    path.join(
      'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm',
    ),
  )
  await checkRow15(
    'NEW file (097a8ce5)',
    path.join(
      'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_097a8ce5.xlsm',
    ),
  )
  await checkRow15(
    'OTHER file (e6472bbc)',
    path.join(
      'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_e6472bbc.xlsm',
    ),
  )
})().catch((e) => console.error(e))
