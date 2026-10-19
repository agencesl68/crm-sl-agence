// Tests de la lecture des fichiers Excel de prospection : `npm test` (Node 22).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { classify, mapHeader, prospectKey, prospectsFrom, readWorkbook } from '../src/lib/excel.ts'

/** Petit classeur Excel fabriqué à la main : couleurs RVB, couleur de thème éclaircie et couleur indexée. */
function workbook(): Uint8Array {
  const shared = ['Entreprise', 'Secteur', 'Nom du contact', 'E- Mail', 'Date du contact', 'Cabinet Martin', 'Notaire', 'Maître Martin',
    'contact@martin.fr', 'Dentego', 'Dentiste', 'Garage Schmitt', 'Kiné Rebberg', 'Agence Sud', 'mulhouse@foncia.fr / strasbourg@foncia.fr', 'Foncia']
  const s = (i: number, ref: string, style = 0) => `<c r="${ref}" s="${style}" t="s"><v>${i}</v></c>`
  const sheet1 = `<worksheet><sheetData>
    <row r="1">${s(0, 'A1')}${s(1, 'B1')}${s(2, 'C1')}${s(3, 'D1')}${s(4, 'E1')}</row>
    <row r="2">${s(5, 'A2', 1)}${s(6, 'B2', 1)}${s(7, 'C2', 1)}${s(8, 'D2', 1)}<c r="E2" s="1"><v>45580</v></c></row>
    <row r="3">${s(9, 'A3', 2)}${s(10, 'B3', 2)}<c r="C3" s="2"/></row>
    <row r="4">${s(11, 'A4', 3)}${s(12, 'B4')}</row>
    <row r="5">${s(13, 'A5', 4)}</row>
    <row r="6" s="2" customFormat="1">${s(15, 'A6')}${s(14, 'D6')}</row>
  </sheetData></worksheet>`
  // Feuille sans en-tête : reprend les colonnes de la première
  const sheet2 = `<worksheet><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>ARPEN</t></is></c></row></sheetData></worksheet>`
  const styles = `<styleSheet><fills count="6">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB6D7A8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor theme="5" tint="0.5999938962981048"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor indexed="10"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC9DAF8"/></patternFill></fill>
  </fills><cellXfs count="5"><xf fillId="0"/><xf fillId="2"/><xf fillId="3"/><xf fillId="4"/><xf fillId="5"/></cellXfs></styleSheet>`
  const theme = `<a:theme xmlns:a="x"><a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
  </a:clrScheme></a:themeElements></a:theme>`
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Prospection" sheetId="1" r:id="rId1"/><sheet name="Mails" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet1),
    'xl/worksheets/sheet2.xml': strToU8(sheet2),
    'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`),
    'xl/styles.xml': strToU8(styles),
    'xl/theme/theme1.xml': strToU8(theme),
  })
}

test('couleurs : vert, orange (jaune compris), rouge ; blanc, gris et bleu ignorés', () => {
  for (const hex of ['B6D7A8', 'D9EAD3', 'C6EFCE', '00B050', '93C47D']) assert.equal(classify(hex), 'vert', hex)
  for (const hex of ['FCE5CD', 'F6B26B', 'FFC000', 'FFF2CC', 'FFFF00', 'F4B183']) assert.equal(classify(hex), 'orange', hex)
  for (const hex of ['F4CCCC', 'FF0000', 'EA9999', 'FFC7CE', 'E06666']) assert.equal(classify(hex), 'rouge', hex)
  for (const hex of ['FFFFFF', 'D9D9D9', 'C9DAF8', '000000', '4472C4']) assert.equal(classify(hex), null, hex)
})

test('lecture du classeur : textes, couleurs RVB, de thème et indexées, feuille sans en-tête', () => {
  const sheets = readWorkbook(workbook())
  assert.deepEqual(sheets.map((s) => s.name), ['Prospection', 'Mails'])
  const { rows, uncolored } = prospectsFrom(sheets)
  assert.equal(uncolored, 1) // « Agence Sud », en bleu : ni vert, ni orange, ni rouge
  assert.deepEqual(rows.map((r) => [r.company, r.color]), [
    ['Cabinet Martin', 'vert'], ['Dentego', 'orange'], ['Garage Schmitt', 'rouge'], ['Foncia', 'orange'], ['ARPEN', 'vert'],
  ])
  assert.deepEqual(rows[0], {
    company: 'Cabinet Martin', sector: 'Notaire', size: null, address: null, city: null, contact_name: 'Maître Martin',
    email: 'contact@martin.fr', phone: null, interest: null, notes: null, contacted_on: '2024-10-15', followup_on: null, color: 'vert',
  })
  assert.equal(rows[3]!.email, 'mulhouse@foncia.fr') // première adresse quand il y en a deux
})

test('en-têtes du fichier de prospection SL Agence', () => {
  const header = ['Entreprise ', "Secteur d'activité ", 'Taille entreprise ', 'Adresse postale', 'Commune ', 'Nom du contact ', 'E- Mail ', 'Statut ', 'Intérêt potentiel', 'Date du contact ', 'Date de relance ']
  assert.deepEqual(mapHeader(header), { company: 0, sector: 1, size: 2, address: 3, city: 4, contact_name: 5, email: 6, interest: 8, contacted_on: 9, followup_on: 10 })
})

test('clé de dédoublonnage', () => {
  assert.equal(prospectKey({ email: 'Contact@Martin.fr', company: 'X' }), 'contact@martin.fr')
  assert.equal(prospectKey({ email: null, company: 'Étude Nicolas PRAT ' }), 'etudenicolasprat')
})

test('fichier qui n’est pas un Excel', () => {
  assert.throws(() => readWorkbook(new TextEncoder().encode('pas un zip')), /pas un fichier Excel/)
})
