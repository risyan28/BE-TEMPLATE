const XlsxPopulate = require('xlsx-populate')
const JSZip = require('jszip')
const path = require('path')

const filePath = path.join(
  'uploads',
  '2026-04-06',
  'AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_34311c98.xlsm',
)

XlsxPopulate.fromFileAsync(filePath, { password: 'cando' })
  .then(async (wb) => {
    const zipBuf = await wb.outputAsync()
    const zip = await JSZip.loadAsync(zipBuf)

    const wbXml = await zip.file('xl/workbook.xml').async('string')
    const sheetMatch =
      wbXml.match(/name="mitumori"[^>]+r:id="(rId\d+)"/i) ||
      wbXml.match(/name="mitumori"[^>]+Id="(rId\d+)"/i)
    const rId = sheetMatch ? sheetMatch[1] : null
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string')
    const tgtRe1 = new RegExp('Id="' + rId + '"[^>]+Target="([^"]+)"')
    const tgtRe2 = new RegExp('Target="([^"]+)"[^>]+Id="' + rId + '"')
    const tgtMatch = relsXml.match(tgtRe1) || relsXml.match(tgtRe2)
    const sheetPath = tgtMatch ? 'xl/' + tgtMatch[1] : null
    console.log('Sheet path:', sheetPath)

    const sheetXml = await zip.file(sheetPath).async('string')

    // Extract rows 9-16
    const rowRe = /<row\b[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g
    let m
    while ((m = rowRe.exec(sheetXml)) !== null) {
      const rowNum = parseInt(m[1])
      if (rowNum < 9 || rowNum > 16) continue
      const rowXml = m[0]
      // Find H, I, J cells
      const cellRe = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g
      let cm
      const hjCells = []
      while ((cm = cellRe.exec(rowXml)) !== null) {
        const col0 = cm[1].charAt(0)
        if (col0 === 'H' || col0 === 'I' || col0 === 'J') {
          hjCells.push(
            '  ' +
              cm[1] +
              ' attrs=[' +
              cm[2].trim() +
              '] content=[' +
              cm[3].trim().slice(0, 80) +
              ']',
          )
        }
      }
      if (hjCells.length > 0) {
        console.log('Row ' + rowNum + ':')
        hjCells.forEach((x) => console.log(x))
      }
    }

    // Merge cells involving H, I, J
    const mergeRe = /<mergeCell ref="([^"]+)"/g
    const merges = []
    let mm
    while ((mm = mergeRe.exec(sheetXml)) !== null) {
      if (/[HIJ]/.test(mm[1])) merges.push(mm[1])
    }
    console.log('\nMerges involving H/I/J:', merges.join(', '))
  })
  .catch((e) => console.error(e.message))
