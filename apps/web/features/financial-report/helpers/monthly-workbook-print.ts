import { CFB } from "xlsx-js-style";
import type { WorkBook } from "xlsx-js-style";
import { MONTHLY_SHEET_THEMES } from "./monthly-workbook-theme";

type ZipApi = {
  read(data: Uint8Array, options: { type: "array" }): unknown;
  find(archive: unknown, path: string): { content: Uint8Array } | null;
  utils: { cfb_add(archive: unknown, path: string, content: Uint8Array): void };
  write(archive: unknown, options: { type: "array"; fileType: "zip"; compression: boolean }): number[];
};

/** The existing style writer omits pane and print setup XML. Add only those
 * standard OOXML elements to its generated archive, keeping cells untouched. */
export function applyMonthlyPrintLayout(bytes: Uint8Array, workbook: WorkBook): Uint8Array {
  const zip = CFB as ZipApi;
  const archive = zip.read(bytes, { type: "array" });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const replacePart = (path: string, transform: (xml: string) => string) => {
    const entry = zip.find(archive, `/${path}`);
    if (!entry) throw new Error("File Excel tidak lengkap. Silakan coba lagi.");
    zip.utils.cfb_add(archive, `/${path}`, encoder.encode(transform(decoder.decode(new Uint8Array(entry.content)))));
  };
  workbook.SheetNames.forEach((name, index) => {
    replacePart(`xl/worksheets/sheet${index + 1}.xml`, (xml) => {
      const daily = index === 2;
      const guide = name === "PANDUAN";
      const frozenRows = daily ? 8 : index < 2 || guide ? 0 : 6;
      const frozen = frozenRows ? `<pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${frozenRows + 1}" sqref="A${frozenRows + 1}"/>` : "";
      const views = `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${frozen}</sheetView></sheetViews>`;
      xml = /<sheetViews>/.test(xml) ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, views) : xml.replace(/(<dimension[^>]*\/>)/, `$1${views}`);
      xml = xml.replace(/<sheetPr\s*\/>/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
      if (!xml.includes("<sheetPr")) xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
      xml = xml.replace(/(<sheetPr\b[^>]*>)/, `$1<tabColor rgb="FF${MONTHLY_SHEET_THEMES[index].primary}"/>`);
      const setup = `<pageSetup paperSize="9" orientation="${index === 1 || daily || guide ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>`;
      xml = /<pageSetup\b/.test(xml) ? xml.replace(/<pageSetup\b[^>]*\/>/, setup) : xml.replace(/(<pageMargins[^>]*\/>)/, `$1${setup}`);
      const footer = '<headerFooter><oddFooter>&amp;L Laporan Keuangan&amp;R Halaman &amp;P dari &amp;N</oddFooter></headerFooter>';
      return xml.replace(setup, `${setup}${footer}`);
    });
  });
  replacePart("xl/workbook.xml", (xml) => {
    const calc = '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
    return /<calcPr\b/.test(xml) ? xml.replace(/<calcPr\b[^>]*\/>/, calc) : xml.replace("</workbook>", `${calc}</workbook>`);
  });
  return new Uint8Array(zip.write(archive, { type: "array", fileType: "zip", compression: true }));
}
